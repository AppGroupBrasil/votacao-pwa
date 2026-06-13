import logging
import os
import re

import jwt

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.conf import settings
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django_ratelimit.decorators import ratelimit
from rest_framework import generics, permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework.views import APIView

from apps.condominios.models import Condominio
from core.authentication import (
    ACCESS_COOKIE,
    APP_SLUGS,
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_auth_cookies,
)
from core.models import PerfilAdmin

audit = logging.getLogger("audit")

PIN_PATTERN = re.compile(r"^\d{6}$")


def validate_pin(value):
    if not PIN_PATTERN.match(value or ""):
        raise ValidationError("A senha deve conter exatamente 6 dígitos numéricos.")


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.RegexField(
        r"^\d{6}$",
        write_only=True,
        error_messages={"invalid": "A senha deve conter exatamente 6 dígitos numéricos."},
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "first_name", "last_name"]

    def create(self, validated_data):
        from .models import PerfilAdmin

        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            is_staff=True,
        )
        PerfilAdmin.objects.create(user=user, role="sindico")
        return user


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    condominios_ids = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "is_staff", "is_superuser", "role", "condominios_ids",
        ]

    def get_role(self, obj):
        if obj.is_superuser:
            return "master"
        perfil = getattr(obj, "perfil_admin", None)
        if perfil:
            return perfil.role
        return None

    def get_condominios_ids(self, obj):
        if obj.is_superuser:
            return []  # master sees all, no need to list
        perfil = getattr(obj, "perfil_admin", None)
        if perfil:
            return [str(c) for c in perfil.condominios.values_list("id", flat=True)]
        return []


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer

    def get_permissions(self):
        return [permissions.AllowAny()]


@ratelimit(key="ip", rate="10/m", block=True)
@ratelimit(key="post:username", rate="5/m", block=True)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    username = str(request.data.get("username", "")).strip()
    password = str(request.data.get("password", ""))
    remember = bool(request.data.get("remember", False))

    if not username or not password:
        return Response(
            {"detail": "Username e password são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ip = request.META.get("HTTP_X_FORWARDED_FOR", request.META.get("REMOTE_ADDR", "")).split(",")[0].strip()
    user = authenticate(username=username, password=password)
    if user is None:
        audit.warning("login_failed username=%s ip=%s", username, ip)
        return Response(
            {"detail": "Usuário e/ou senha incorreto(s)"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    audit.info("login_ok user_id=%s username=%s ip=%s remember=%s", user.id, user.username, ip, remember)
    refresh = RefreshToken.for_user(user)
    refresh_max_age = None
    if remember:
        from datetime import timedelta
        extended = timedelta(days=30)
        refresh.set_exp(lifetime=extended)
        refresh_max_age = int(extended.total_seconds())
    response = Response(UserSerializer(user).data)
    set_auth_cookies(response, str(refresh.access_token), str(refresh), refresh_max_age=refresh_max_age)
    return response


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def refresh_view(request):
    from rest_framework_simplejwt.serializers import TokenRefreshSerializer
    refresh_token = request.COOKIES.get(REFRESH_COOKIE) or request.data.get("refresh")
    if not refresh_token:
        return Response({"detail": "Refresh token ausente."}, status=status.HTTP_401_UNAUTHORIZED)
    serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
    try:
        serializer.is_valid(raise_exception=True)
    except Exception:
        response = Response({"detail": "Refresh inválido."}, status=status.HTTP_401_UNAUTHORIZED)
        clear_auth_cookies(response)
        return response
    data = serializer.validated_data
    response = Response({"refreshed": True})
    set_auth_cookies(response, data["access"], data.get("refresh"))
    return response


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def logout_view(request):
    refresh_token = request.COOKIES.get(REFRESH_COOKIE)
    if refresh_token:
        try:
            RefreshToken(refresh_token).blacklist()
        except (TokenError, AttributeError):
            pass
    response = Response({"logged_out": True})
    clear_auth_cookies(response)
    return response


# ── SSO da central (auth-central) ────────────────────────────────
@ratelimit(key="ip", rate="20/m", block=True)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def sso_view(request):
    """Consome o token SSO curto do auth-central: valida a assinatura, cria ou
    encontra o usuário pelo e-mail (provisioning just-in-time), vincula o
    condomínio do token e abre a sessão local (cookies HttpOnly) — sem senha."""
    token = str(request.data.get("token", "")).strip()
    if not token:
        return Response({"detail": "Token ausente."}, status=status.HTTP_400_BAD_REQUEST)

    secret = os.getenv("SSO_SECRET") or os.getenv("JWT_SECRET") or ""
    if not secret:
        return Response({"detail": "SSO não configurado."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer="auth-central",
            options={"require": ["exp", "iss"]},
        )
    except Exception:
        return Response({"detail": "Token SSO inválido ou expirado."}, status=status.HTTP_401_UNAUTHORIZED)

    if payload.get("aud") not in APP_SLUGS:
        return Response({"detail": "Token não destinado a este aplicativo."}, status=status.HTTP_403_FORBIDDEN)

    email = str(payload.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "Token sem e-mail."}, status=status.HTTP_400_BAD_REQUEST)
    nome = payload.get("nome") or email
    perfil = payload.get("perfil") or "gestor"
    # gestor/funcionário gerenciam o painel; morador é eleitor (fluxo próprio, sem admin)
    is_gestor = perfil in ("gestor", "funcionario")

    user, created = User.objects.get_or_create(
        email=email,
        defaults={"username": email, "first_name": str(nome)[:150], "is_active": True},
    )
    if created:
        user.set_unusable_password()
    if is_gestor and not user.is_staff:
        user.is_staff = True
    user.save()

    if is_gestor:
        perfil_admin, _ = PerfilAdmin.objects.get_or_create(user=user, defaults={"role": "sindico"})
        cond_id = payload.get("condominio_id")
        if cond_id:
            cond_nome = payload.get("condominio_nome") or "Condomínio"
            cond, c_created = Condominio.objects.get_or_create(
                id=cond_id,
                defaults={"nome": cond_nome, "cnpj": f"SSO-{str(cond_id)[:8]}", "total_unidades": 0},
            )
            if not c_created and cond_nome and cond.nome != cond_nome:
                cond.nome = cond_nome
                cond.save(update_fields=["nome", "atualizado_em"])
            perfil_admin.condominios.add(cond)

    refresh = RefreshToken.for_user(user)
    audit.info("sso_login user_id=%s email=%s perfil=%s created=%s", user.id, email, perfil, created)
    response = Response(UserSerializer(user).data)
    set_auth_cookies(response, str(refresh.access_token), str(refresh))
    return response


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        user = request.user

        if "email" in request.data:
            email = str(request.data["email"]).strip().lower()
            try:
                validate_email(email)
            except ValidationError:
                return Response(
                    {"error": "E-mail inválido."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                return Response(
                    {"error": "Este e-mail já está em uso."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = email

        for field in ("first_name", "last_name"):
            if field in request.data:
                setattr(user, field, str(request.data[field])[:150])

        new_password = request.data.get("new_password")
        if new_password:
            try:
                validate_pin(new_password)
            except ValidationError as exc:
                return Response(
                    {"error": " ".join(exc.messages)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)

        user.save()
        return Response(UserSerializer(user).data)

    def delete(self, request):
        user = request.user
        if user.is_superuser:
            return Response(
                {"error": "Conta master não pode ser excluída."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Password reset (request) ────────────────────────────────────
@ratelimit(key="ip", rate="5/h", block=True)
@ratelimit(key="post:email", rate="3/h", block=True)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    """Send password-reset email. Always returns 200 to prevent enumeration."""
    email = str(request.data.get("email", "")).strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        return Response({"sent": True})
    try:
        user = User.objects.get(email__iexact=email)
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        frontend_base_url = getattr(settings, "FRONTEND_APP_URL", "http://localhost:3000").rstrip("/")
        reset_url = f"{frontend_base_url}/redefinir-senha/{uid}/{token}"
        send_mail(
            subject="Redefinir senha — Votação Online",
            message=(
                f"Olá, {user.first_name or user.username}.\n\n"
                f"Você solicitou a redefinição da sua senha. Clique no link abaixo para criar uma nova senha:\n\n"
                f"{reset_url}\n\n"
                f"Se você não solicitou isso, ignore este e-mail. O link é válido por tempo limitado."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    except User.DoesNotExist:
        pass
    return Response({"sent": True})


@ratelimit(key="ip", rate="10/h", block=True)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    """Validate uid+token and set a new password."""
    uid = str(request.data.get("uid", "")).strip()
    token = str(request.data.get("token", "")).strip()
    new_password = str(request.data.get("new_password", ""))

    if not uid or not token or not new_password:
        return Response(
            {"error": "Dados incompletos."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user_pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_pk)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist):
        return Response(
            {"error": "Link inválido ou expirado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not default_token_generator.check_token(user, token):
        return Response(
            {"error": "Link inválido ou expirado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_pin(new_password)
    except ValidationError as exc:
        return Response(
            {"error": " ".join(exc.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.save()
    audit.info("password_reset_ok user_id=%s username=%s", user.id, user.username)
    return Response({"reset": True})


# ── Master-only views ────────────────────────────────────────────
class IsMasterUser(permissions.BasePermission):
    """Only superusers (master) can access."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_superuser


class MasterUserSerializer(serializers.ModelSerializer):
    total_condominios = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    condominios_ids = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "is_active", "is_staff", "is_superuser", "date_joined",
            "last_login", "total_condominios", "role", "condominios_ids",
        ]
        read_only_fields = ["id", "date_joined", "last_login", "total_condominios"]

    def get_total_condominios(self, obj):
        perfil = getattr(obj, "perfil_admin", None)
        if perfil:
            return perfil.condominios.count()
        return 0

    def get_role(self, obj):
        if obj.is_superuser:
            return "master"
        perfil = getattr(obj, "perfil_admin", None)
        if perfil:
            return perfil.role
        return None

    def get_condominios_ids(self, obj):
        perfil = getattr(obj, "perfil_admin", None)
        if perfil:
            return [str(c) for c in perfil.condominios.values_list("id", flat=True)]
        return []


class MasterCondominioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Condominio
        fields = "__all__"
        read_only_fields = ["id", "criado_em", "atualizado_em"]


@api_view(["GET"])
@permission_classes([IsMasterUser])
def master_dashboard(request):
    """Overview stats for master."""
    return Response({
        "total_usuarios": User.objects.count(),
        "total_condominios": Condominio.objects.count(),
        "condominios_adimplentes": Condominio.objects.filter(adimplente=True).count(),
        "condominios_inadimplentes": Condominio.objects.filter(adimplente=False).count(),
    })


@api_view(["GET"])
@permission_classes([IsMasterUser])
def master_users_list(request):
    """List all users for master management."""
    users = User.objects.all().order_by("-date_joined")
    serializer = MasterUserSerializer(users, many=True)
    return Response(serializer.data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMasterUser])
def master_user_detail(request, user_id):
    """Edit or delete a user. Supports role and condominios assignment."""
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "Usuário não encontrado"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        allowed = ["is_active", "is_staff", "first_name", "last_name", "email"]
        for field in allowed:
            if field in request.data:
                setattr(user, field, request.data[field])
        user.save()

        # Handle role + condominios assignment
        role = request.data.get("role")
        condominios_ids = request.data.get("condominios_ids")

        if role and role != "master":
            perfil, _ = PerfilAdmin.objects.get_or_create(user=user)
            perfil.role = role
            perfil.save()
            user.is_staff = True
            user.save(update_fields=["is_staff"])

        if condominios_ids is not None:
            perfil, _ = PerfilAdmin.objects.get_or_create(user=user)
            perfil.condominios.set(condominios_ids)

        return Response(MasterUserSerializer(user).data)

    if request.method == "DELETE":
        if user.is_superuser:
            return Response({"error": "Não é possível excluir um master"}, status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsMasterUser])
def master_condominios_list(request):
    """List all condominios with adimplente status."""
    condominios = Condominio.objects.all().order_by("nome")
    serializer = MasterCondominioSerializer(condominios, many=True)
    return Response(serializer.data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsMasterUser])
def master_condominio_detail(request, condominio_id):
    """Edit (toggle adimplente) or delete a condominio."""
    try:
        cond = Condominio.objects.get(id=condominio_id)
    except Condominio.DoesNotExist:
        return Response({"error": "Condomínio não encontrado"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        allowed = ["nome", "cnpj", "total_unidades", "adimplente"]
        for field in allowed:
            if field in request.data:
                setattr(cond, field, request.data[field])
        cond.save()
        return Response(MasterCondominioSerializer(cond).data)

    if request.method == "DELETE":
        cond.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

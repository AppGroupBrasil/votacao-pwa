import logging
import os

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.conf import settings
from django_ratelimit.decorators import ratelimit
from rest_framework import generics, permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework.views import APIView

from apps.condominios.models import Condominio
from core.authentication import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    set_auth_cookies,
)
from core.models import PerfilAdmin

audit = logging.getLogger("audit")


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "first_name", "last_name"]

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
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
        if os.getenv("DJANGO_ENV", "development").lower() == "production":
            return [IsMasterUser()]
        return [permissions.AllowAny()]


@ratelimit(key="ip", rate="10/m", block=True)
@ratelimit(key="post:username", rate="5/m", block=True)
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_view(request):
    username = str(request.data.get("username", "")).strip()
    password = str(request.data.get("password", ""))

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

    audit.info("login_ok user_id=%s username=%s ip=%s", user.id, user.username, ip)
    refresh = RefreshToken.for_user(user)
    response = Response(UserSerializer(user).data)
    set_auth_cookies(response, str(refresh.access_token), str(refresh))
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
                validate_password(new_password, user=user)
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
        # In production, send real link; in dev, print to console
        send_mail(
            subject="Redefinir senha — Votação Online",
            message=f"Use este token para redefinir sua senha: {token}\n\nUsuário: {user.username}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    except User.DoesNotExist:
        pass
    return Response({"sent": True})


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

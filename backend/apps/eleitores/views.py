import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.condominios.models import Condominio
from core.permissions import IsAdminWithRole, get_user_condominios

from .models import Eleitor
from .serializers import EleitorOnboardingSerializer, EleitorSerializer


class EleitorViewSet(viewsets.ModelViewSet):
    serializer_class = EleitorSerializer
    permission_classes = [IsAdminWithRole]
    search_fields = ["nome", "apartamento", "email"]
    filterset_fields = ["condominio", "cadastro_completo"]

    def get_queryset(self):
        qs = Eleitor.objects.select_related("condominio").all()
        cond_ids = get_user_condominios(self.request.user)
        if cond_ids is not None:
            qs = qs.filter(condominio_id__in=cond_ids)
        return qs

    def perform_create(self, serializer):
        token = secrets.token_urlsafe(48)
        serializer.save(
            convite_token=token,
            convite_expira_em=timezone.now() + timedelta(days=7),
        )

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_create(self, request):
        condominio_id = request.data.get("condominio")
        rows = request.data.get("eleitores") or []
        if not condominio_id:
            return Response(
                {"error": "Condomínio é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cond_ids = get_user_condominios(request.user)
        if cond_ids is not None and str(condominio_id) not in {str(c) for c in cond_ids}:
            return Response(
                {"error": "Sem acesso a este condomínio."},
                status=status.HTTP_403_FORBIDDEN,
            )

        criados = 0
        erros = []
        for i, row in enumerate(rows, start=2):  # linha 2 = primeira linha de dados
            serializer = EleitorSerializer(data={**row, "condominio": condominio_id})
            if serializer.is_valid():
                serializer.save(
                    convite_token=secrets.token_urlsafe(48),
                    convite_expira_em=timezone.now() + timedelta(days=7),
                )
                criados += 1
            else:
                erros.append({"linha": i, "erros": serializer.errors})

        return Response({"criados": criados, "erros": erros})

    @action(detail=True, methods=["post"], url_path="bloqueio")
    def set_bloqueio(self, request, pk=None):
        eleitor = self.get_object()
        eleitor.bloqueado = bool(request.data.get("bloqueado", not eleitor.bloqueado))
        eleitor.save(update_fields=["bloqueado"])
        return Response({"bloqueado": eleitor.bloqueado})

    @action(detail=True, methods=["post"], url_path="inadimplencia")
    def set_inadimplencia(self, request, pk=None):
        eleitor = self.get_object()
        valor = bool(request.data.get("inadimplente", not eleitor.inadimplente))
        # Inadimplência é por unidade: aplica a todos os moradores da mesma
        # unidade (condomínio + bloco + apartamento).
        afetados = self.get_queryset().filter(
            condominio_id=eleitor.condominio_id,
            bloco=eleitor.bloco,
            apartamento=eleitor.apartamento,
        )
        afetados.update(inadimplente=valor)
        return Response(
            {
                "inadimplente": valor,
                "afetados": [str(e.id) for e in afetados],
            }
        )

    @action(detail=True, methods=["post"], url_path="enviar-convite")
    def enviar_convite(self, request, pk=None):
        eleitor = self.get_object()
        eleitor.convite_token = secrets.token_urlsafe(48)
        eleitor.convite_expira_em = timezone.now() + timedelta(days=7)
        eleitor.save(update_fields=["convite_token", "convite_expira_em"])

        frontend_base_url = getattr(settings, "FRONTEND_APP_URL", "http://localhost:3000").rstrip("/")
        convite_url = f"{frontend_base_url}/cadastro/{eleitor.convite_token}"

        send_mail(
            subject="Convite para cadastro - Votação Online",
            message=(
                f"Olá, {eleitor.nome}.\n\n"
                f"Acesse o link abaixo para concluir seu cadastro:\n{convite_url}\n\n"
                "Se você não solicitou este acesso, ignore esta mensagem."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[eleitor.email],
            fail_silently=False,
        )

        return Response(
            {"message": "Convite enviado"},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["get", "post"],
        url_path="autocadastro/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def autocadastro(self, request, token=None):
        condominio = get_object_or_404(Condominio, autocadastro_token=token)
        if not condominio.autocadastro_ativo:
            return Response(
                {"error": "O autocadastro deste condomínio não está liberado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            return Response(
                {
                    "condominio_nome": condominio.nome,
                    "blocos": condominio.blocos or [],
                }
            )

        # POST: morador se autocadastra
        serializer = EleitorSerializer(
            data={**request.data, "condominio": str(condominio.id)}
        )
        serializer.is_valid(raise_exception=True)
        convite_token = secrets.token_urlsafe(48)
        serializer.save(
            convite_token=convite_token,
            convite_expira_em=timezone.now() + timedelta(days=7),
        )
        return Response(
            {"message": "Cadastro iniciado", "token": convite_token},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="convite/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def validar_convite(self, request, token=None):
        eleitor = get_object_or_404(Eleitor, convite_token=token)
        if eleitor.convite_expira_em and timezone.now() > eleitor.convite_expira_em:
            return Response(
                {"error": "Convite expirado. Solicite um novo."},
                status=status.HTTP_410_GONE,
            )
        return Response(
            {
                "id": str(eleitor.id),
                "nome": eleitor.nome,
                "apartamento": eleitor.apartamento,
                "cadastro_completo": eleitor.cadastro_completo,
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="onboarding/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def onboarding(self, request, token=None):
        eleitor = get_object_or_404(Eleitor, convite_token=token)
        if eleitor.convite_expira_em and timezone.now() > eleitor.convite_expira_em:
            return Response(
                {"error": "Convite expirado. Solicite um novo."},
                status=status.HTTP_410_GONE,
            )
        serializer = EleitorOnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        eleitor.biometria_hash = serializer.validated_data["biometria_hash"]
        eleitor.cadastro_completo = True
        eleitor.convite_token = None
        eleitor.convite_expira_em = None
        eleitor.save(
            update_fields=[
                "biometria_hash",
                "cadastro_completo",
                "convite_token",
                "convite_expira_em",
            ]
        )

        return Response(
            {"message": "Cadastro completo"},
            status=status.HTTP_200_OK,
        )

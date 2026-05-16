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

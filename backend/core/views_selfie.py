"""
Selfie como degrau da escada de identidade (facial -> selfie -> webauthn -> otp).
Não faz conferência biométrica: captura a foto e emite o token de votação
(decisão do produto — o voto conta na hora; a administração revê as selfies
depois se precisar). Espelha facial_auth_verify.
"""
from django.core import signing
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.eleitores.models import Eleitor
from apps.assembleias.models import Presenca
from core.request_info import presenca_request_defaults


@api_view(["POST"])
@permission_classes([AllowAny])
def selfie_auth_verify(request):
    """Body: { "eleitor_id": "uuid", "assembleia_id": "uuid", "selfie": "dataURL" }"""
    eleitor_id = request.data.get("eleitor_id")
    assembleia_id = request.data.get("assembleia_id", "")
    selfie = str(request.data.get("selfie", ""))

    if not eleitor_id or not selfie.startswith("data:image/"):
        return Response(
            {"error": "eleitor_id e selfie são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(selfie) > 3_500_000:
        return Response(
            {"error": "Selfie muito grande. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)
    if eleitor.bloqueado:
        return Response(
            {"error": "Morador bloqueado. Procure a administração."},
            status=status.HTTP_403_FORBIDDEN,
        )

    vote_token = signing.dumps(
        {
            "eleitor_id": str(eleitor.id),
            "assembleia_id": assembleia_id,
            "method": "selfie",
        },
        salt="vote-auth",
    )

    if assembleia_id:
        presenca, created = Presenca.objects.get_or_create(
            assembleia_id=assembleia_id,
            eleitor=eleitor,
            defaults={
                "nome": eleitor.nome,
                "bloco": eleitor.bloco,
                "apartamento": eleitor.apartamento,
                "perfil": eleitor.perfil,
                "metodo_auth": "selfie",
                "selfie": selfie,
                **presenca_request_defaults(request),
            },
        )
        if not created and not presenca.selfie:
            presenca.selfie = selfie
            presenca.metodo_auth = "selfie"
            presenca.save(update_fields=["selfie", "metodo_auth"])

    return Response({
        "authenticated": True,
        "method": "selfie",
        "eleitor_id": str(eleitor.id),
        "votos_permitidos": max(1, eleitor.votos_permitidos or 1),
        "token": vote_token,
    })

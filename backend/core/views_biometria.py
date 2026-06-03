"""
Biometria facial REST API — verificação de identidade durante a votação.
O cliente compara o descritor localmente e o servidor exige o hash do descritor
de cadastro para emitir o token de votação.
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
def facial_auth_verify(request):
    """
    Verifica identidade facial e emite token de votação.
    O client já fez a comparação euclidiana; aqui validamos se o hash
    corresponde ao armazenado no cadastro.

    Body: { "eleitor_id": "uuid", "assembleia_id": "uuid", "hash": "sha256hex" }
    """
    eleitor_id = request.data.get("eleitor_id")
    assembleia_id = request.data.get("assembleia_id", "")
    face_hash = request.data.get("hash")

    if not eleitor_id or not face_hash:
        return Response(
            {"error": "eleitor_id e hash são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    if eleitor.bloqueado:
        return Response(
            {"error": "Morador bloqueado. Procure a administração."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not eleitor.biometria_hash:
        return Response(
            {"error": "Biometria facial não cadastrada para este eleitor"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if face_hash != eleitor.biometria_hash:
        return Response(
            {"error": "Assinatura facial inválida para este dispositivo cadastrado"},
            status=status.HTTP_403_FORBIDDEN,
        )

    vote_token = signing.dumps(
        {
            "eleitor_id": str(eleitor.id),
            "assembleia_id": assembleia_id,
            "method": "facial",
        },
        salt="vote-auth",
    )

    # Auto-register attendance
    if assembleia_id:
        Presenca.objects.get_or_create(
            assembleia_id=assembleia_id,
            eleitor=eleitor,
            defaults={
                "nome": eleitor.nome,
                "bloco": eleitor.bloco,
                "apartamento": eleitor.apartamento,
                "perfil": eleitor.perfil,
                "metodo_auth": "facial",
                "assinatura_facial": face_hash,
                **presenca_request_defaults(request),
            },
        )

    return Response({
        "authenticated": True,
        "method": "facial",
        "eleitor_id": str(eleitor.id),
        "token": vote_token,
    })

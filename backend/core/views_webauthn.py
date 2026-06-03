"""
WebAuthn REST API endpoints for registration and authentication ceremonies.
"""
from django.core import signing
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from webauthn.helpers import base64url_to_bytes

from apps.eleitores.models import Eleitor
from apps.assembleias.models import Presenca
from core.request_info import presenca_request_defaults
from core.webauthn import (
    get_authentication_options_json,
    get_registration_options_json,
    verify_authentication,
    verify_registration,
)


# ---------------------------------------------------------------------------
# Registration (during onboarding)
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def webauthn_register_options(request):
    """
    Step 1 of registration: generate PublicKeyCredentialCreationOptions.
    Body: { "eleitor_id": "uuid" }
    """
    eleitor_id = request.data.get("eleitor_id")
    if not eleitor_id:
        return Response(
            {"error": "eleitor_id é obrigatório"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    if eleitor.webauthn_credential:
        return Response(
            {"error": "WebAuthn já cadastrado para este eleitor"},
            status=status.HTTP_409_CONFLICT,
        )

    options = get_registration_options_json(
        user_id=str(eleitor.id),
        user_name=eleitor.email,
        user_display_name=f"{eleitor.nome} - Apto {eleitor.apartamento}",
    )

    return Response(options)


@api_view(["POST"])
@permission_classes([AllowAny])
def webauthn_register_verify(request):
    """
    Step 2 of registration: verify the authenticator response and persist credential.
    Body: { "eleitor_id": "uuid", "credential": { ...attestation response... } }
    """
    eleitor_id = request.data.get("eleitor_id")
    credential = request.data.get("credential")

    if not eleitor_id or not credential:
        return Response(
            {"error": "eleitor_id e credential são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    try:
        result = verify_registration(str(eleitor.id), credential)
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response(
            {"error": "Falha na verificação WebAuthn"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Persist credential data (public key, credential_id, sign_count)
    eleitor.webauthn_credential = result
    eleitor.save(update_fields=["webauthn_credential"])

    return Response({"message": "WebAuthn cadastrado com sucesso"})


# ---------------------------------------------------------------------------
# Authentication (during voting)
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def webauthn_auth_options(request):
    """
    Step 1 of authentication: generate PublicKeyCredentialRequestOptions.
    Body: { "eleitor_id": "uuid" }
    """
    eleitor_id = request.data.get("eleitor_id")
    if not eleitor_id:
        return Response(
            {"error": "eleitor_id é obrigatório"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    if not eleitor.webauthn_credential:
        return Response(
            {"error": "WebAuthn não cadastrado para este eleitor"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    credential_id_bytes = base64url_to_bytes(
        eleitor.webauthn_credential["credential_id"]
    )

    options = get_authentication_options_json(
        eleitor_id=str(eleitor.id),
        credential_ids=[credential_id_bytes],
    )

    return Response(options)


@api_view(["POST"])
@permission_classes([AllowAny])
def webauthn_auth_verify(request):
    """
    Step 2 of authentication: verify the authenticator assertion.
    Body: { "eleitor_id": "uuid", "credential": { ...assertion response... } }
    Returns auth token for voting if valid.
    """
    eleitor_id = request.data.get("eleitor_id")
    credential = request.data.get("credential")

    if not eleitor_id or not credential:
        return Response(
            {"error": "eleitor_id e credential são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    if not eleitor.webauthn_credential:
        return Response(
            {"error": "WebAuthn não cadastrado"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    stored = eleitor.webauthn_credential
    public_key_bytes = base64url_to_bytes(stored["public_key"])
    sign_count = stored.get("sign_count", 0)

    try:
        result = verify_authentication(
            eleitor_id=str(eleitor.id),
            credential_json=credential,
            credential_public_key=public_key_bytes,
            credential_current_sign_count=sign_count,
        )
    except ValueError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response(
            {"error": "Falha na autenticação WebAuthn"},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Update sign count
    stored["sign_count"] = result["new_sign_count"]
    eleitor.webauthn_credential = stored
    eleitor.save(update_fields=["webauthn_credential"])

    # Generate a short-lived signed token for voting (15 min)
    assembleia_id = request.data.get("assembleia_id", "")
    vote_token = signing.dumps(
        {"eleitor_id": str(eleitor.id), "assembleia_id": assembleia_id, "method": "webauthn"},
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
                "metodo_auth": "webauthn",
                **presenca_request_defaults(request),
            },
        )

    return Response({
        "authenticated": True,
        "method": "webauthn",
        "eleitor_id": str(eleitor.id),
        "token": vote_token,
    })

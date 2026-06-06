"""
OTP REST API — último fallback de autenticação para votação.
Envia código de 6 dígitos por e-mail e valida para emitir token de voto.
"""
import json
import os

from django.core import signing
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django_ratelimit.decorators import ratelimit

from apps.eleitores.models import Eleitor
from apps.assembleias.models import Assembleia, Presenca
from core.otp import gerar_otp, validar_otp
from core.request_info import presenca_request_defaults


# O django_ratelimit roda ANTES do api_view (a request ainda é a HttpRequest
# crua, sem request.data) e a chave "post:" só lê form-encoded — com corpo JSON
# ela fica vazia e vira um balde global. Estas funções leem o JSON do corpo para
# que o limite seja realmente por e-mail / por eleitor.
def _json_body_field(request, field):
    try:
        body = (request.body or b"{}").decode("utf-8") or "{}"
        return str(json.loads(body).get(field) or "")
    except (ValueError, AttributeError, UnicodeDecodeError):
        return ""


def _ratekey_email(group, request):
    return _json_body_field(request, "email").strip().lower()


def _ratekey_eleitor(group, request):
    return _json_body_field(request, "eleitor_id")


def _mascarar_email(email):
    parts = email.split("@")
    return parts[0][0] + "***@" + parts[1] if len(parts) == 2 else "***"


def _resolver_eleitor_por_email(assembleia_id, email):
    """Localiza o eleitor pelo e-mail dentro do condomínio da assembleia.
    Retorna (eleitor, erro_response)."""
    email = (email or "").strip().lower()
    if not email or not assembleia_id:
        return None, Response(
            {"error": "email e assembleia_id são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)
    eleitor = (
        Eleitor.objects.filter(
            condominio=assembleia.condominio, email__iexact=email
        )
        .order_by("criado_em")
        .first()
    )
    if not eleitor:
        return None, Response(
            {"error": "E-mail não encontrado para esta assembleia."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return eleitor, None


@ratelimit(key="ip", rate="5/m", block=True)
@ratelimit(key=_ratekey_eleitor, rate="3/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def otp_send(request):
    """
    Gera OTP de 6 dígitos e envia por e-mail ao eleitor.
    Body: { "eleitor_id": "uuid", "assembleia_id": "uuid" }
    """
    eleitor_id = request.data.get("eleitor_id")
    if not eleitor_id:
        return Response(
            {"error": "eleitor_id é obrigatório"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    if not eleitor.email:
        return Response(
            {"error": "Eleitor não possui e-mail cadastrado"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = gerar_otp(str(eleitor.id))

    # Mascarar e-mail para exibir no frontend (ex: e***@gmail.com)
    parts = eleitor.email.split("@")
    masked = parts[0][0] + "***@" + parts[1] if len(parts) == 2 else "***"

    send_mail(
        subject="Código de Votação",
        message=f"Seu código de verificação é: {code}\n\nVálido por 10 minutos.",
        from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, "DEFAULT_FROM_EMAIL") else None,
        recipient_list=[eleitor.email],
        fail_silently=False,
    )

    return Response({
        "sent": True,
        "email_masked": masked,
    })


@ratelimit(key="ip", rate="10/m", block=True)
@ratelimit(key=_ratekey_eleitor, rate="5/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def otp_verify(request):
    """
    Valida OTP e emite token de votação.
    Body: { "eleitor_id": "uuid", "assembleia_id": "uuid", "code": "123456" }
    """
    eleitor_id = request.data.get("eleitor_id")
    assembleia_id = request.data.get("assembleia_id", "")
    code = request.data.get("code", "")

    if not eleitor_id or not code:
        return Response(
            {"error": "eleitor_id e code são obrigatórios"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = get_object_or_404(Eleitor, id=eleitor_id)

    reviewer_id = os.environ.get("REVIEWER_ELEITOR_ID", "").strip()
    reviewer_code = os.environ.get("REVIEWER_OTP_CODE", "").strip()
    is_reviewer_bypass = (
        reviewer_id
        and reviewer_code
        and str(eleitor.id) == reviewer_id
        and code == reviewer_code
    )

    if not is_reviewer_bypass and not validar_otp(str(eleitor.id), code):
        return Response(
            {"error": "Código inválido ou expirado"},
            status=status.HTTP_403_FORBIDDEN,
        )

    vote_token = signing.dumps(
        {
            "eleitor_id": str(eleitor.id),
            "assembleia_id": assembleia_id,
            "method": "otp",
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
                "metodo_auth": "otp",
                **presenca_request_defaults(request),
            },
        )

    return Response({
        "authenticated": True,
        "method": "otp",
        "eleitor_id": str(eleitor.id),
        "votos_permitidos": max(1, eleitor.votos_permitidos or 1),
        "token": vote_token,
    })


@ratelimit(key="ip", rate="5/m", block=True)
@ratelimit(key=_ratekey_email, rate="3/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def otp_send_email(request):
    """
    Identificação sem login: localiza o eleitor pelo e-mail e envia OTP.
    Body: { "email": "...", "assembleia_id": "uuid" }
    """
    eleitor, erro = _resolver_eleitor_por_email(
        request.data.get("assembleia_id", ""), request.data.get("email")
    )
    if erro:
        return erro

    if not eleitor.email:
        return Response(
            {"error": "Eleitor não possui e-mail cadastrado"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = gerar_otp(str(eleitor.id))
    send_mail(
        subject="Código de Votação",
        message=f"Seu código de verificação é: {code}\n\nVálido por 10 minutos.",
        from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, "DEFAULT_FROM_EMAIL") else None,
        recipient_list=[eleitor.email],
        fail_silently=False,
    )

    return Response({
        "sent": True,
        "email_masked": _mascarar_email(eleitor.email),
    })


@ratelimit(key="ip", rate="10/m", block=True)
@ratelimit(key=_ratekey_email, rate="5/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def otp_verify_email(request):
    """
    Valida OTP identificando o eleitor pelo e-mail e emite token de votação.
    Body: { "email": "...", "assembleia_id": "uuid", "code": "123456" }
    """
    assembleia_id = request.data.get("assembleia_id", "")
    code = request.data.get("code", "")
    eleitor, erro = _resolver_eleitor_por_email(
        assembleia_id, request.data.get("email")
    )
    if erro:
        return erro

    if not code:
        return Response(
            {"error": "code é obrigatório"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reviewer_id = os.environ.get("REVIEWER_ELEITOR_ID", "").strip()
    reviewer_code = os.environ.get("REVIEWER_OTP_CODE", "").strip()
    is_reviewer_bypass = (
        reviewer_id
        and reviewer_code
        and str(eleitor.id) == reviewer_id
        and code == reviewer_code
    )

    if not is_reviewer_bypass and not validar_otp(str(eleitor.id), code):
        return Response(
            {"error": "Código inválido ou expirado"},
            status=status.HTTP_403_FORBIDDEN,
        )

    vote_token = signing.dumps(
        {
            "eleitor_id": str(eleitor.id),
            "assembleia_id": assembleia_id,
            "method": "otp",
        },
        salt="vote-auth",
    )

    if assembleia_id:
        Presenca.objects.get_or_create(
            assembleia_id=assembleia_id,
            eleitor=eleitor,
            defaults={
                "nome": eleitor.nome,
                "bloco": eleitor.bloco,
                "apartamento": eleitor.apartamento,
                "perfil": eleitor.perfil,
                "metodo_auth": "otp",
                **presenca_request_defaults(request),
            },
        )

    return Response({
        "authenticated": True,
        "method": "otp",
        "eleitor_id": str(eleitor.id),
        "votos_permitidos": max(1, eleitor.votos_permitidos or 1),
        "token": vote_token,
    })

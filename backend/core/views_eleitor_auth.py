"""
Acesso do morador por login + senha.

Fluxo:
  1. login (e-mail + senha) -> emite session_token (salt "eleitor-session")
  2. troca de senha obrigatória no 1º acesso (senha_alterada=False)
  3. cadastro de biometria (facial; fallback digital via WebAuthn)
  4. registro de presença na assembleia aberta do condomínio

A biometria continua sendo o credencial usado para votar (token vote-auth é
emitido pelos endpoints de verificação facial/webauthn/otp). O login por senha
é apenas o portão de acesso, não substitui a verificação para votar.
"""
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_ratelimit.decorators import ratelimit
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

import re
import unicodedata

from apps.assembleias.models import Assembleia, Presenca
from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor
from core.request_info import presenca_request_defaults

SESSION_SALT = "eleitor-session"
SESSION_MAX_AGE = 60 * 60  # 1h


def _emit_session(eleitor):
    return signing.dumps({"eleitor_id": str(eleitor.id)}, salt=SESSION_SALT)


def _resolve_session(token):
    try:
        payload = signing.loads(token, salt=SESSION_SALT, max_age=SESSION_MAX_AGE)
    except SignatureExpired:
        raise ValueError("Sessão expirada. Faça login novamente.")
    except BadSignature:
        raise ValueError("Sessão inválida. Faça login novamente.")
    return get_object_or_404(Eleitor, id=payload["eleitor_id"])


def _eleitor_state(eleitor):
    return {
        "eleitor_id": str(eleitor.id),
        "nome": eleitor.nome,
        "bloco": eleitor.bloco,
        "apartamento": eleitor.apartamento,
        "perfil": eleitor.perfil,
        "condominio_id": str(eleitor.condominio_id),
        "precisa_trocar_senha": not eleitor.senha_alterada,
        "precisa_biometria": not eleitor.tem_biometria,
        "inadimplente": eleitor.inadimplente,
    }


@ratelimit(key="ip", rate="10/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def eleitor_login(request):
    login = str(request.data.get("login", "")).strip().lower()
    senha = request.data.get("senha", "")
    if not login or not senha:
        return Response(
            {"error": "Informe login e senha."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor = Eleitor.objects.filter(email__iexact=login).first()
    if not eleitor or not eleitor.check_senha(senha):
        return Response(
            {"error": "Login ou senha inválidos."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if eleitor.bloqueado:
        return Response(
            {"error": "Morador bloqueado. Procure a administração."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return Response(
        {"session_token": _emit_session(eleitor), **_eleitor_state(eleitor)}
    )


def _norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _gerar_login(condominio, nome, bloco, apartamento):
    base = f"{_norm(nome)}.{_norm(bloco)}{_norm(apartamento)}@morador.appvotacao"
    login, i = base, 1
    while Eleitor.objects.filter(email__iexact=login).exists():
        i += 1
        login = base.replace("@", f"{i}@")
    return login


@api_view(["GET"])
@permission_classes([AllowAny])
def eleitor_condominio_info(request):
    """Dados públicos do condomínio por CNPJ (nome + blocos) para o autocadastro."""
    cnpj = str(request.query_params.get("cnpj", "")).strip()
    condominio = Condominio.objects.filter(cnpj=cnpj).first()
    if not condominio:
        return Response(
            {"error": "Condomínio não encontrado."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response({"nome": condominio.nome, "blocos": condominio.blocos or []})


@ratelimit(key="ip", rate="10/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def eleitor_cadastro(request):
    """Autocadastro do morador por CNPJ do condomínio.

    Cria o eleitor com nome/bloco/apartamento/senha, herda a inadimplência da
    unidade (se já houver outro morador inadimplente na mesma unidade) e emite
    sessão para seguir o fluxo (facial -> presença -> sala).
    """
    cnpj = str(request.data.get("cnpj", "")).strip()
    nome = str(request.data.get("nome", "")).strip()
    bloco = str(request.data.get("bloco", "")).strip()
    apartamento = str(request.data.get("apartamento", "")).strip()
    senha = str(request.data.get("senha", ""))

    if not (cnpj and nome and apartamento and senha):
        return Response(
            {"error": "Preencha nome, apartamento e senha."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(senha) < 6:
        return Response(
            {"error": "A senha deve ter ao menos 6 caracteres."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    condominio = Condominio.objects.filter(cnpj=cnpj).first()
    if not condominio:
        return Response(
            {"error": "Condomínio não encontrado."},
            status=status.HTTP_404_NOT_FOUND,
        )

    ja_existe = Eleitor.objects.filter(
        condominio=condominio,
        bloco__iexact=bloco,
        apartamento__iexact=apartamento,
        nome__iexact=nome,
    ).first()
    if ja_existe:
        return Response(
            {"error": "Você já está cadastrado. Faça login com seu e-mail e senha."},
            status=status.HTTP_409_CONFLICT,
        )

    # Herda inadimplência da unidade (mesma unidade já marcada inadimplente)
    inadimplente_unidade = Eleitor.objects.filter(
        condominio=condominio,
        bloco__iexact=bloco,
        apartamento__iexact=apartamento,
        inadimplente=True,
    ).exists()

    eleitor = Eleitor(
        condominio=condominio,
        nome=nome,
        bloco=bloco,
        apartamento=apartamento,
        email=_gerar_login(condominio, nome, bloco, apartamento),
        inadimplente=inadimplente_unidade,
        senha_alterada=True,  # já definiu a própria senha no cadastro
    )
    eleitor.set_senha(senha)
    eleitor.save()

    return Response(
        {
            "session_token": _emit_session(eleitor),
            "login": eleitor.email,
            **_eleitor_state(eleitor),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def eleitor_trocar_senha(request):
    try:
        eleitor = _resolve_session(request.data.get("session_token", ""))
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    nova = str(request.data.get("nova_senha", ""))
    if len(nova) < 6:
        return Response(
            {"error": "A nova senha deve ter ao menos 6 caracteres."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor.set_senha(nova)
    eleitor.senha_alterada = True
    eleitor.save(update_fields=["senha", "senha_alterada"])
    return Response({"ok": True, **_eleitor_state(eleitor)})


@api_view(["POST"])
@permission_classes([AllowAny])
def eleitor_cadastrar_biometria(request):
    """Salva a biometria facial (hash do descritor) do morador autenticado."""
    try:
        eleitor = _resolve_session(request.data.get("session_token", ""))
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    face_hash = str(request.data.get("biometria_hash", "")).strip()
    if not face_hash:
        return Response(
            {"error": "biometria_hash é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    eleitor.biometria_hash = face_hash
    eleitor.cadastro_completo = True
    eleitor.save(update_fields=["biometria_hash", "cadastro_completo"])
    return Response({"ok": True, **_eleitor_state(eleitor)})


def _assembleia_aberta(eleitor):
    return (
        Assembleia.objects.filter(
            condominio_id=eleitor.condominio_id,
            status=Assembleia.Status.ABERTA,
        )
        .order_by("-data_inicio")
        .first()
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def eleitor_presenca(request):
    """Registra presença do morador na assembleia aberta e devolve a lista."""
    try:
        eleitor = _resolve_session(request.data.get("session_token", ""))
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    if not eleitor.tem_biometria:
        return Response(
            {"error": "Cadastre a biometria antes de registrar presença."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    assembleia = _assembleia_aberta(eleitor)
    if not assembleia:
        return Response(
            {"error": "Não há assembleia aberta no momento."},
            status=status.HTTP_404_NOT_FOUND,
        )

    metodo = "facial" if eleitor.biometria_hash else "webauthn"
    Presenca.objects.get_or_create(
        assembleia=assembleia,
        eleitor=eleitor,
        defaults={
            "nome": eleitor.nome,
            "bloco": eleitor.bloco,
            "apartamento": eleitor.apartamento,
            "perfil": eleitor.perfil,
            "metodo_auth": metodo,
            "assinatura_facial": eleitor.biometria_hash or "",
            **presenca_request_defaults(request),
        },
    )

    presencas = [
        {
            "nome": p.nome,
            "bloco": p.bloco,
            "apartamento": p.apartamento,
            "perfil": p.perfil,
            "horario_entrada": p.horario_entrada,
            "eu": p.eleitor_id == eleitor.id,
        }
        for p in assembleia.presencas.all()
    ]

    return Response(
        {
            "assembleia_id": str(assembleia.id),
            "assembleia_titulo": assembleia.titulo,
            "total_presentes": len(presencas),
            "presencas": presencas,
        }
    )

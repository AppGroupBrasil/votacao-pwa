import hashlib
import logging
import uuid

from django.db import transaction
from django_ratelimit.decorators import ratelimit

audit = logging.getLogger("audit")
from django.db.models import Count, Q, Sum
from django.http import Http404
from django.utils import timezone
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.assembleias.models import Assembleia, OpcaoVoto, Presenca, Questao
from apps.eleitores.models import Eleitor, IdentidadeFacial
from apps.eleitores.facial import melhor_correspondencia, validar_descriptor
from core.permissions import IsAdminWithRole, get_user_condominios

from .models import VotanteManual, Voto
from .serializers import RelatorioVotoSerializer, VotoCreateSerializer


VOTE_AUTH_MAX_AGE_SECONDS = 900


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


def get_client_user_agent(request):
    return str(request.META.get("HTTP_USER_AGENT", "")).strip()


def infer_device_info(user_agent):
    if not user_agent:
        return "Não informado"

    ua = user_agent.lower()

    if "iphone" in ua:
        platform = "iPhone"
    elif "ipad" in ua:
        platform = "iPad"
    elif "android" in ua:
        platform = "Android"
    elif "windows" in ua:
        platform = "Windows"
    elif "mac os x" in ua or "macintosh" in ua:
        platform = "macOS"
    elif "linux" in ua:
        platform = "Linux"
    else:
        platform = "Dispositivo desconhecido"

    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "edg/" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Navegador desconhecido"

    return f"{platform} / {browser}"


def get_accessible_assembleia(request, assembleia_id):
    assembleia = get_object_or_404(Assembleia.objects.select_related("condominio"), id=assembleia_id)
    cond_ids = get_user_condominios(request.user)
    if cond_ids is not None and assembleia.condominio_id not in cond_ids:
        raise Http404
    return assembleia


def _parse_capture_fields(data):
    """Campos de captura de identidade (LGPD/geo/assinatura/marca) enviados pelo
    cliente. Só entram os presentes; selfie/assinatura têm teto de tamanho para
    não estourar o corpo da requisição."""
    out = {}
    marca = str(data.get("marca_aparelho", "")).strip()[:120]
    if marca:
        out["marca_aparelho"] = marca
    assinatura = str(data.get("assinatura", ""))
    if assinatura.startswith("data:image/") and len(assinatura) <= 1_500_000:
        out["assinatura"] = assinatura
    selfie = str(data.get("selfie", ""))
    if selfie.startswith("data:image/") and len(selfie) <= 3_500_000:
        out["selfie"] = selfie
    modo = str(data.get("modo_participacao", "")).strip().lower()
    if modo in ("presencial", "online"):
        out["modo_participacao"] = modo
    for campo in ("geo_lat", "geo_lng"):
        val = data.get(campo)
        if val not in (None, ""):
            try:
                out[campo] = float(val)
            except (TypeError, ValueError):
                pass
    if "consentimento_lgpd" in data:
        consentiu = bool(data.get("consentimento_lgpd"))
        out["consentimento_lgpd"] = consentiu
        if consentiu:
            out["consentimento_em"] = timezone.now()
    if "declaracao_veracidade" in data:
        out["declaracao_veracidade"] = bool(data.get("declaracao_veracidade"))
    return out


def _capture_from_presenca(presenca):
    """Copia os campos de captura da presença do eleitor para o voto, mantendo
    a mesma linha de auditoria (método, selfie, assinatura, IP, geo, etc.)."""
    if not presenca:
        return {}
    return {
        "selfie": presenca.selfie or "",
        "assinatura": presenca.assinatura or "",
        "marca_aparelho": presenca.marca_aparelho or "",
        "modo_participacao": presenca.modo_participacao or "presencial",
        "geo_lat": presenca.geo_lat,
        "geo_lng": presenca.geo_lng,
        "consentimento_lgpd": presenca.consentimento_lgpd,
        "consentimento_em": presenca.consentimento_em,
        "declaracao_veracidade": presenca.declaracao_veracidade,
    }


def resolve_vote_auth_token(auth_token, assembleia_id):
    try:
        payload = signing.loads(
            auth_token,
            salt="vote-auth",
            max_age=VOTE_AUTH_MAX_AGE_SECONDS,
        )
    except SignatureExpired:
        raise ValueError("Autenticação expirada. Refaça a verificação para votar.")
    except BadSignature:
        raise ValueError("Token de autenticação inválido.")

    token_assembleia_id = str(payload.get("assembleia_id", ""))
    token_eleitor_id = str(payload.get("eleitor_id", ""))
    token_method = str(payload.get("method", "")).strip().lower()

    if token_method == "manual":
        token_manual_id = str(payload.get("manual_id", ""))
        if not token_manual_id or not token_assembleia_id:
            raise ValueError("Token de autenticação incompleto.")
        if token_assembleia_id != str(assembleia_id):
            raise ValueError("Token de autenticação não pertence a esta assembleia.")
        return {
            "manual_id": token_manual_id,
            "metodo_auth": "manual",
        }

    if not token_eleitor_id or not token_assembleia_id or not token_method:
        raise ValueError("Token de autenticação incompleto.")

    if token_assembleia_id != str(assembleia_id):
        raise ValueError("Token de autenticação não pertence a esta assembleia.")

    allowed_methods = {choice for choice, _label in Voto.MetodoAuth.choices}
    if token_method not in allowed_methods:
        raise ValueError("Método de autenticação inválido no token.")

    return {
        "eleitor_id": token_eleitor_id,
        "metodo_auth": token_method,
    }


@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def registrar_voto(request, assembleia_id):
    serializer = VotoCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        assembleia = get_object_or_404(
            Assembleia.objects.select_for_update(), id=assembleia_id
        )

        if assembleia.status != Assembleia.Status.ABERTA:
            return Response(
                {"error": "Esta assembleia não está aberta para votação"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not assembleia.votacao_liberada:
            return Response(
                {"error": "A votação ainda não foi liberada. Aguarde a liberação pela administração."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agora = timezone.now()
        if assembleia.data_inicio and agora < assembleia.data_inicio:
            return Response(
                {"error": "A votação ainda não começou"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if assembleia.data_fim and agora > assembleia.data_fim:
            return Response(
                {"error": "O período de votação já encerrou"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            auth_context = resolve_vote_auth_token(
                serializer.validated_data["auth_token"],
                assembleia.id,
            )
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_403_FORBIDDEN,
            )

        if auth_context.get("manual_id"):
            return _registrar_voto_manual(request, assembleia, serializer, auth_context)

        auth_eleitor_id = auth_context["eleitor_id"]
        request_eleitor_id = serializer.validated_data.get("eleitor_id")
        por_procuracao = bool(serializer.validated_data.get("por_procuracao"))
        unidade_declarada = bool(serializer.validated_data.get("unidade_declarada"))
        procurador = None
        decl_bloco = decl_apartamento = decl_nome = ""
        grupo_declaracao = None

        if unidade_declarada:
            # O morador declara, durante a votação, outra unidade que possui.
            # Só permitido no modo "morador"; o voto fica pendente até a validação.
            if (
                assembleia.modo_multiplas_unidades
                != Assembleia.ModoMultiplasUnidades.MORADOR
            ):
                return Response(
                    {"error": "A declaração de outras unidades não está habilitada nesta assembleia."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            eleitor = get_object_or_404(Eleitor, id=auth_eleitor_id)
            decl_bloco = (serializer.validated_data.get("decl_bloco") or "").strip()
            decl_apartamento = (serializer.validated_data.get("decl_apartamento") or "").strip()
            decl_nome = (serializer.validated_data.get("decl_nome") or "").strip()
            grupo_declaracao = serializer.validated_data.get("grupo_declaracao")
            if not decl_apartamento or not decl_nome:
                return Response(
                    {"error": "Informe o apartamento/unidade e o nome do proprietário."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                decl_bloco.lower() == (eleitor.bloco or "").strip().lower()
                and decl_apartamento.lower() == (eleitor.apartamento or "").strip().lower()
            ):
                return Response(
                    {"error": "Esta é a sua própria unidade — vote nela normalmente."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif por_procuracao:
            # O morador autenticado vota por outra unidade que representa.
            # Esse voto fica pendente até o síndico validar a procuração.
            if not request_eleitor_id:
                return Response(
                    {"error": "Informe a unidade representada para o voto por procuração"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            procurador = get_object_or_404(Eleitor, id=auth_eleitor_id)
            eleitor = get_object_or_404(Eleitor, id=request_eleitor_id)
            if eleitor.id == procurador.id:
                return Response(
                    {"error": "A unidade representada deve ser diferente da sua"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            if request_eleitor_id and str(request_eleitor_id) != auth_eleitor_id:
                return Response(
                    {"error": "Token de autenticação não corresponde ao eleitor informado"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            eleitor = get_object_or_404(Eleitor, id=auth_eleitor_id)

        if eleitor.bloqueado:
            return Response(
                {"error": "Morador bloqueado. Procure a administração."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if eleitor.inadimplente:
            return Response(
                {
                    "error": "Entre em contato com sua administradora.",
                    "code": "inadimplente",
                    "whatsapp": (eleitor.condominio.whatsapp_administradora or "").strip(),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not assembleia.votantes.filter(id=eleitor.id).exists():
            # No link sem login o morador se auto-identifica (e-mail/facial/OTP).
            # Se for do mesmo condomínio e voto próprio, inscreve-o automaticamente
            # na lista de votantes. A unidade representada em procuração continua
            # exigindo inscrição prévia (gate preservado).
            if por_procuracao or eleitor.condominio_id != assembleia.condominio_id:
                return Response(
                    {"error": "Eleitor não está na lista de votantes desta assembleia"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            assembleia.votantes.add(eleitor)

        device_id = (serializer.validated_data.get("device_id") or "").strip()
        if device_id and not por_procuracao and not unidade_declarada:
            conflito = (
                Voto.objects.filter(assembleia=assembleia, device_id=device_id)
                .exclude(eleitor=eleitor)
                .exists()
            )
            if conflito:
                return Response(
                    {
                        "error": "Você já votou neste dispositivo. Se tiver procuração, solicite o voto por procuração à administração do condomínio."
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        questao = get_object_or_404(
            Questao, id=serializer.validated_data["questao_id"], assembleia=assembleia
        )
        opcao = get_object_or_404(
            OpcaoVoto, id=serializer.validated_data["opcao_id"], questao=questao
        )

        if questao.encerrada:
            return Response(
                {"error": "A votação deste item foi encerrada."},
                status=status.HTTP_409_CONFLICT,
            )

        if unidade_declarada:
            # Unidade declarada não consome a cota própria do declarante.
            # Garante 1 voto por unidade declarada nesta questão e impede
            # declarar uma unidade que já votou (real ou outra declaração).
            # Sem select_for_update: o lock da Assembleia no início da transação
            # já serializa os votos, e FOR UPDATE não funciona nos LEFT JOINs
            # dos FKs anuláveis (eleitor/votante_manual).
            dup = (
                Voto.objects.filter(assembleia=assembleia, questao=questao)
                .filter(
                    Q(
                        unidade_declarada=True,
                        decl_bloco__iexact=decl_bloco,
                        decl_apartamento__iexact=decl_apartamento,
                    )
                    | Q(
                        unidade_declarada=False,
                        por_procuracao=False,
                        eleitor__bloco__iexact=decl_bloco,
                        eleitor__apartamento__iexact=decl_apartamento,
                    )
                    | Q(
                        votante_manual__isnull=False,
                        votante_manual__bloco__iexact=decl_bloco,
                        votante_manual__apartamento__iexact=decl_apartamento,
                    )
                )
                .exclude(status=Voto.Status.REJEITADO)
                .exists()
            )
            if dup:
                return Response(
                    {"error": "Esta unidade já tem um voto nesta questão."},
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            # Quantos votos este eleitor pode dar nesta questão (1 por unidade;
            # mais de 1 quando possui mais de uma unidade). Procuração não consome
            # a cota do procurador — conta para a unidade representada.
            votos_permitidos = max(1, eleitor.votos_permitidos or 1)
            ja_votou = (
                Voto.objects.select_for_update()
                .filter(eleitor=eleitor, questao=questao, unidade_declarada=False)
                .exclude(status=Voto.Status.REJEITADO)
                .count()
            )
            if ja_votou >= votos_permitidos:
                return Response(
                    {"error": "Você já usou todos os seus votos nesta questão."},
                    status=status.HTTP_409_CONFLICT,
                )

        # Cadastro tem prioridade sobre voto manual: se a unidade do eleitor já
        # tinha voto manual contabilizado nesta questão, ele volta para revisão
        # do síndico (pendente) e o voto do eleitor cadastrado entra normalmente.
        if not por_procuracao and not unidade_declarada:
            Voto.objects.filter(
                assembleia=assembleia,
                questao=questao,
                votante_manual__isnull=False,
                votante_manual__bloco__iexact=(eleitor.bloco or "").strip(),
                votante_manual__apartamento__iexact=(eleitor.apartamento or "").strip(),
                status=Voto.Status.VALIDADO,
            ).update(status=Voto.Status.PENDENTE)

        # Um voto por unidade: se outro morador da mesma unidade
        # (condomínio + bloco + apartamento) já votou nesta questão, bloqueia.
        if not por_procuracao and not unidade_declarada:
            unidade_ja_votou = (
                Voto.objects.filter(
                    assembleia=assembleia,
                    questao=questao,
                    eleitor__condominio=eleitor.condominio_id,
                    eleitor__bloco__iexact=(eleitor.bloco or "").strip(),
                    eleitor__apartamento__iexact=(eleitor.apartamento or "").strip(),
                )
                .exclude(eleitor=eleitor)
                .exclude(status=Voto.Status.REJEITADO)
                .exists()
            )
            if unidade_ja_votou:
                return Response(
                    {"error": "Sua unidade já tem um voto."},
                    status=status.HTTP_409_CONFLICT,
                )

        presenca_eleitor = Presenca.objects.filter(
            assembleia=assembleia, eleitor=eleitor
        ).first()
        voto = Voto(
            assembleia=assembleia,
            eleitor=eleitor,
            questao=questao,
            opcao_escolhida=opcao,
            metodo_auth=auth_context["metodo_auth"],
            ip_address=get_client_ip(request),
            user_agent=get_client_user_agent(request),
            device_info=infer_device_info(get_client_user_agent(request)),
            device_id=device_id,
            **_capture_from_presenca(presenca_eleitor),
            por_procuracao=por_procuracao,
            procurador=procurador,
            unidade_declarada=unidade_declarada,
            decl_bloco=decl_bloco,
            decl_apartamento=decl_apartamento,
            decl_nome=decl_nome,
            grupo_declaracao=grupo_declaracao,
            status=(
                Voto.Status.PENDENTE
                if (por_procuracao or unidade_declarada)
                else Voto.Status.VALIDADO
            ),
        )
        voto.save()

    audit.info(
        "voto_registrado assembleia=%s questao=%s eleitor=%s metodo=%s hash=%s",
        assembleia.id, questao.id, eleitor.id, voto.metodo_auth, voto.hash_voto,
    )
    return Response(
        {
            "message": "Voto registrado com sucesso",
            "hash_voto": voto.hash_voto,
            "timestamp": voto.timestamp,
        },
        status=status.HTTP_201_CREATED,
    )


def _registrar_voto_manual(request, assembleia, serializer, auth_context):
    """Voto do votante manual (sem cadastro, identificado por selfie).
    Conta imediatamente; entra pendente só quando há conflito de unidade
    (a unidade já votou por outro caminho) ou de dispositivo."""
    if serializer.validated_data.get("por_procuracao") or serializer.validated_data.get(
        "unidade_declarada"
    ):
        return Response(
            {"error": "O voto manual vale apenas para a própria unidade."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    votante = get_object_or_404(
        VotanteManual, id=auth_context["manual_id"], assembleia=assembleia
    )
    questao = get_object_or_404(
        Questao, id=serializer.validated_data["questao_id"], assembleia=assembleia
    )
    opcao = get_object_or_404(
        OpcaoVoto, id=serializer.validated_data["opcao_id"], questao=questao
    )

    if questao.encerrada:
        return Response(
            {"error": "A votação deste item foi encerrada."},
            status=status.HTTP_409_CONFLICT,
        )

    ja_votou = (
        Voto.objects.select_for_update()
        .filter(votante_manual=votante, questao=questao)
        .exclude(status=Voto.Status.REJEITADO)
        .exists()
    )
    if ja_votou:
        return Response(
            {"error": "Você já votou nesta questão."},
            status=status.HTTP_409_CONFLICT,
        )

    bloco = (votante.bloco or "").strip()
    apartamento = (votante.apartamento or "").strip()
    # Sem unidade informada (rosto reconhecido sem apartamento) não dá para
    # deduplicar por unidade — evita marcar pendente à toa.
    conflito_unidade = bool(apartamento) and (
        Voto.objects.filter(assembleia=assembleia, questao=questao)
        .filter(
            Q(
                votante_manual__isnull=False,
                votante_manual__bloco__iexact=bloco,
                votante_manual__apartamento__iexact=apartamento,
            )
            | Q(
                eleitor__isnull=False,
                unidade_declarada=False,
                eleitor__bloco__iexact=bloco,
                eleitor__apartamento__iexact=apartamento,
            )
            | Q(
                unidade_declarada=True,
                decl_bloco__iexact=bloco,
                decl_apartamento__iexact=apartamento,
            )
        )
        .exclude(votante_manual=votante)
        .exclude(status=Voto.Status.REJEITADO)
        .exists()
    )

    device_id = (serializer.validated_data.get("device_id") or "").strip()
    conflito_device = bool(device_id) and (
        Voto.objects.filter(assembleia=assembleia, device_id=device_id)
        .exclude(votante_manual=votante)
        .exclude(status=Voto.Status.REJEITADO)
        .exists()
    )

    voto = Voto(
        assembleia=assembleia,
        eleitor=None,
        votante_manual=votante,
        questao=questao,
        opcao_escolhida=opcao,
        metodo_auth=(
            Voto.MetodoAuth.FACIAL
            if votante.identidade_facial_id
            else Voto.MetodoAuth.MANUAL
        ),
        ip_address=get_client_ip(request),
        user_agent=get_client_user_agent(request),
        device_info=infer_device_info(get_client_user_agent(request)),
        device_id=device_id,
        status=(
            Voto.Status.PENDENTE
            if (conflito_unidade or conflito_device)
            else Voto.Status.VALIDADO
        ),
    )
    voto.save()

    audit.info(
        "voto_manual_registrado assembleia=%s questao=%s votante=%s status=%s hash=%s",
        assembleia.id, questao.id, votante.id, voto.status, voto.hash_voto,
    )
    return Response(
        {
            "message": "Voto registrado com sucesso",
            "hash_voto": voto.hash_voto,
            "timestamp": voto.timestamp,
            "status": voto.status,
        },
        status=status.HTTP_201_CREATED,
    )


@ratelimit(key="ip", rate="10/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def acesso_manual(request, assembleia_id):
    """Entrada pela votação manual: morador sem cadastro (ou que não lembra o
    e-mail) informa nome/unidade e uma selfie de comprovação. Registra a
    presença e emite o token de voto."""
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)

    if assembleia.status != Assembleia.Status.ABERTA:
        return Response(
            {"error": "Esta assembleia não está aberta para votação"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nome = str(request.data.get("nome", "")).strip()
    bloco = str(request.data.get("bloco", "")).strip()
    apartamento = str(request.data.get("apartamento", "")).strip()
    selfie = str(request.data.get("selfie", ""))
    device_id = str(request.data.get("device_id", "")).strip()[:64]

    if not nome or not apartamento:
        return Response(
            {"error": "Informe seu nome e apartamento/unidade."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not selfie.startswith("data:image/"):
        return Response(
            {"error": "A selfie é obrigatória na votação manual."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(selfie) > 3_500_000:
        return Response(
            {"error": "Selfie muito grande. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_agent = get_client_user_agent(request)
    votante = VotanteManual.objects.create(
        assembleia=assembleia,
        nome=nome,
        bloco=bloco,
        apartamento=apartamento,
        selfie=selfie,
        ip_address=get_client_ip(request),
        user_agent=user_agent,
        device_info=infer_device_info(user_agent),
        device_id=device_id,
    )
    Presenca.objects.create(
        assembleia=assembleia,
        eleitor=None,
        nome=nome,
        bloco=bloco,
        apartamento=apartamento,
        metodo_auth="manual",
        selfie=selfie,
        ip_address=get_client_ip(request),
        user_agent=user_agent,
        device_info=infer_device_info(user_agent),
    )

    token = signing.dumps(
        {
            "manual_id": str(votante.id),
            "assembleia_id": str(assembleia.id),
            "method": "manual",
        },
        salt="vote-auth",
    )

    audit.info(
        "acesso_manual assembleia=%s votante=%s unidade=%s/%s",
        assembleia.id, votante.id, bloco, apartamento,
    )
    return Response(
        {
            "authenticated": True,
            "method": "manual",
            "votante_manual_id": str(votante.id),
            "token": token,
        },
        status=status.HTTP_201_CREATED,
    )


@ratelimit(key="ip", rate="20/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def acesso_facial(request, assembleia_id):
    """Entrada da votação pelo rosto (reconhecimento 1:N, igual à lista de
    presença). Se o rosto já é conhecido no condomínio, reconhece e libera o voto
    na hora. Se é a primeira vez, cadastra a identidade facial (nome/unidade/
    selfie/LGPD) ali mesmo. Garante 1 voto por rosto e registra a presença."""
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)

    if assembleia.status != Assembleia.Status.ABERTA:
        return Response(
            {"error": "Esta assembleia não está aberta para votação"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not assembleia.condominio_id:
        return Response(
            {"error": "Esta votação não usa reconhecimento facial."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    descriptor = validar_descriptor(request.data.get("descriptor"))
    if descriptor is None:
        return Response(
            {"error": "Não foi possível ler o rosto. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Procura o rosto entre as identidades já cadastradas no condomínio.
    identidades = IdentidadeFacial.objects.filter(
        condominio_id=assembleia.condominio_id
    ).defer("selfie")
    ident, _dist = melhor_correspondencia(descriptor, identidades)

    novo = False
    if ident is None:
        # Rosto desconhecido: sem nome, avisa o front que precisa do 1º cadastro.
        nome = str(request.data.get("nome", "")).strip()[:200]
        if not nome:
            return Response({"encontrado": False}, status=status.HTTP_200_OK)
        if not bool(request.data.get("consentimento_lgpd")):
            return Response(
                {"error": "É necessário concordar com o uso dos dados (LGPD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        selfie = str(request.data.get("selfie", ""))
        if len(selfie) > 3_500_000:
            return Response(
                {"error": "Imagem muito grande."}, status=status.HTTP_400_BAD_REQUEST
            )
        bloco = str(request.data.get("bloco", "")).strip()[:20]
        apartamento = str(request.data.get("apartamento", "")).strip()[:20]
        if not apartamento:
            return Response(
                {"error": "Informe seu apartamento/unidade."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        perfil = str(request.data.get("perfil", "")).strip().lower()
        if perfil not in {"proprietario", "locatario", "conjuge", "procurador", "outro"}:
            perfil = "proprietario"
        ident = IdentidadeFacial.objects.create(
            condominio_id=assembleia.condominio_id,
            nome=nome,
            bloco=bloco,
            apartamento=apartamento,
            perfil=perfil,
            descriptor=descriptor,
            selfie=selfie,
            consentimento_lgpd=True,
            consentimento_em=timezone.now(),
        )
        novo = True

    # 1 votante por rosto por assembleia (reaproveita quem já entrou antes).
    user_agent = get_client_user_agent(request)
    selfie_ident = (
        IdentidadeFacial.objects.values_list("selfie", flat=True).get(id=ident.id) or ""
    )
    votante, criado = VotanteManual.objects.get_or_create(
        assembleia=assembleia,
        identidade_facial=ident,
        defaults=dict(
            nome=ident.nome,
            bloco=ident.bloco or "",
            apartamento=ident.apartamento or "",
            selfie=selfie_ident,
            ip_address=get_client_ip(request),
            user_agent=user_agent,
            device_info=infer_device_info(user_agent),
            device_id=str(request.data.get("device_id", "")).strip()[:64],
        ),
    )
    if criado:
        Presenca.objects.create(
            assembleia=assembleia,
            eleitor=None,
            nome=votante.nome,
            bloco=votante.bloco,
            apartamento=votante.apartamento,
            metodo_auth="facial",
            selfie=selfie_ident,
            assinatura_facial=hashlib.sha256(str(descriptor).encode()).hexdigest(),
            ip_address=get_client_ip(request),
            user_agent=user_agent,
            device_info=infer_device_info(user_agent),
        )
    if not novo:
        ident.save(update_fields=["ultimo_visto_em"])

    token = signing.dumps(
        {
            "manual_id": str(votante.id),
            "assembleia_id": str(assembleia.id),
            "method": "manual",
        },
        salt="vote-auth",
    )

    audit.info(
        "acesso_facial assembleia=%s votante=%s ident=%s novo=%s",
        assembleia.id, votante.id, ident.id, novo,
    )
    return Response(
        {
            "encontrado": True,
            "authenticated": True,
            "method": "facial",
            "novo": novo,
            "nome": votante.nome,
            "votante_manual_id": str(votante.id),
            "token": token,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def votos_manuais(request, assembleia_id):
    """Painel do síndico: votantes manuais com selfie e situação dos votos,
    para conferência e invalidação a qualquer momento antes do encerramento."""
    assembleia = get_accessible_assembleia(request, assembleia_id)
    votantes = (
        VotanteManual.objects.filter(assembleia=assembleia)
        .prefetch_related("votos__questao")
        .order_by("criado_em")
    )

    data = []
    for votante in votantes:
        votos = list(votante.votos.all())
        statuses = {v.status for v in votos}
        if Voto.Status.PENDENTE in statuses:
            situacao = "pendente"
        elif votos and statuses == {Voto.Status.REJEITADO}:
            situacao = "rejeitado"
        elif votos:
            situacao = "validado"
        else:
            situacao = "sem_votos"
        data.append(
            {
                "id": str(votante.id),
                "nome": votante.nome,
                "bloco": votante.bloco,
                "apartamento": votante.apartamento,
                "selfie": votante.selfie,
                "horario": votante.criado_em,
                "device_info": votante.device_info,
                "situacao": situacao,
                "total_votos": len(votos),
                "votos": [
                    {"questao": v.questao.titulo, "status": v.status} for v in votos
                ],
            }
        )
    return Response({"total": len(data), "votantes": data})


@api_view(["POST"])
@permission_classes([IsAdminWithRole])
def validar_voto_manual(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    votante_id = request.data.get("votante_manual_id")
    acao = str(request.data.get("acao", "")).strip().lower()

    if not votante_id or acao not in {"aprovar", "rejeitar"}:
        return Response(
            {"error": "Informe votante_manual_id e acao (aprovar/rejeitar)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    votante = get_object_or_404(VotanteManual, id=votante_id, assembleia=assembleia)
    if acao == "aprovar":
        qs = Voto.objects.filter(
            assembleia=assembleia,
            votante_manual=votante,
            status=Voto.Status.PENDENTE,
        )
        novo_status = Voto.Status.VALIDADO
    else:
        qs = Voto.objects.filter(
            assembleia=assembleia, votante_manual=votante
        ).exclude(status=Voto.Status.REJEITADO)
        novo_status = Voto.Status.REJEITADO
    atualizados = qs.update(status=novo_status)

    audit.info(
        "voto_manual_%s assembleia=%s votante=%s votos=%s admin=%s",
        acao, assembleia.id, votante.id, atualizados, request.user.id,
    )
    from apps.assembleias.audit import registrar_log
    from apps.assembleias.models import LogAuditoria
    registrar_log(
        request, assembleia,
        LogAuditoria.Acao.VALIDAR_PROCURACAO if acao == "aprovar"
        else LogAuditoria.Acao.REJEITAR_PROCURACAO,
        f"Voto manual de {votante.nome} ({votante.bloco}/{votante.apartamento}): "
        f"{atualizados} voto(s) {'aprovado(s)' if acao == 'aprovar' else 'invalidado(s)'}.",
    )
    return Response({"status": novo_status, "votos_atualizados": atualizados})


@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def registrar_presenca(request, assembleia_id):
    """
    Registra a presença do morador na assembleia após autenticação
    (biometria/desbloqueio via webauthn, facial ou token por e-mail/OTP).
    A presença só é registrada com um auth_token válido.
    """
    auth_token = request.data.get("auth_token")
    if not auth_token:
        return Response(
            {"error": "Autenticação obrigatória para registrar presença"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    assembleia = get_object_or_404(Assembleia, id=assembleia_id)

    try:
        auth_context = resolve_vote_auth_token(auth_token, assembleia.id)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)

    if auth_context.get("manual_id"):
        # Presença do votante manual já foi criada no acesso-manual.
        return Response(
            {"registrado": True, "novo": False, "horario_entrada": timezone.now()},
            status=status.HTTP_200_OK,
        )

    eleitor = get_object_or_404(Eleitor, id=auth_context["eleitor_id"])

    if eleitor.condominio_id != assembleia.condominio_id:
        return Response(
            {"error": "Morador não pertence ao condomínio desta assembleia"},
            status=status.HTTP_403_FORBIDDEN,
        )

    if eleitor.bloqueado:
        return Response(
            {"error": "Morador bloqueado. Procure a administração."},
            status=status.HTTP_403_FORBIDDEN,
        )

    presenca, created = Presenca.objects.get_or_create(
        assembleia=assembleia,
        eleitor=eleitor,
        defaults={
            "nome": eleitor.nome,
            "bloco": eleitor.bloco,
            "apartamento": eleitor.apartamento,
            "perfil": eleitor.perfil,
            "metodo_auth": auth_context["metodo_auth"],
        },
    )

    capture = _parse_capture_fields(request.data)
    if capture:
        for campo, valor in capture.items():
            setattr(presenca, campo, valor)
        presenca.save(update_fields=list(capture.keys()))

    return Response(
        {
            "registrado": True,
            "novo": created,
            "horario_entrada": presenca.horario_entrada,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def presencas_captura(request, assembleia_id):
    """Fotos (selfie/assinatura em base64) das presenças, servidas à parte da
    listagem para não pesar o polling de 15s da tela de presença. Retorna só as
    presenças que têm alguma foto; ?ids=a,b,c limita ao que o cliente ainda não
    baixou (na 1ª carga vêm todas; depois só as que chegaram)."""
    assembleia = get_accessible_assembleia(request, assembleia_id)
    qs = Presenca.objects.filter(assembleia=assembleia).exclude(
        selfie="", assinatura=""
    )
    ids_param = (request.query_params.get("ids") or "").strip()
    if ids_param:
        ids = []
        for i in ids_param.split(","):
            try:
                ids.append(uuid.UUID(i))
            except ValueError:
                continue  # ignora id malformado em vez de derrubar em 500
        qs = qs.filter(id__in=ids)
    capturas = [
        {"id": str(p.id), "selfie": p.selfie, "assinatura": p.assinatura}
        for p in qs.only("id", "selfie", "assinatura")
    ]
    return Response({"capturas": capturas})


@api_view(["GET"])
@permission_classes([AllowAny])
def votacao_publica(request, assembleia_id):
    """
    Tela de votação do morador: devolve título, situação e questões/opções
    SEM expor presenças, identidades ou votos. Acessível publicamente para
    que o eleitor autenticado pelo /acesso consiga carregar as questões.
    """
    from apps.assembleias.serializers import QuestaoSerializer

    assembleia = get_object_or_404(
        Assembleia.objects.prefetch_related("questoes__opcoes"), id=assembleia_id
    )
    return Response(
        {
            "id": str(assembleia.id),
            "titulo": assembleia.titulo,
            "descricao": assembleia.descricao,
            "status": assembleia.status,
            "votacao_liberada": assembleia.votacao_liberada,
            "modo_multiplas_unidades": assembleia.modo_multiplas_unidades,
            "exigir_confirmacao_email": assembleia.exigir_confirmacao_email,
            "questoes": QuestaoSerializer(
                assembleia.questoes.order_by("ordem"), many=True
            ).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def resultados(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    questoes = assembleia.questoes.prefetch_related(
        "opcoes__votos"
    ).all()

    data = []
    total_votantes = assembleia.votantes.count()
    # Total de votos possíveis = soma de votos_permitidos (moradores com mais de
    # uma unidade têm direito a mais de um voto por questão). Em assembleias
    # normais (todos com 1) é igual à contagem de votantes.
    total_votos_possiveis = (
        assembleia.votantes.aggregate(s=Sum("votos_permitidos"))["s"] or 0
    )

    procuracoes_pendentes = (
        Voto.objects.filter(
            assembleia=assembleia,
            por_procuracao=True,
            status=Voto.Status.PENDENTE,
        )
        .values("eleitor")
        .distinct()
        .count()
    ) + (
        Voto.objects.filter(
            assembleia=assembleia,
            unidade_declarada=True,
            status=Voto.Status.PENDENTE,
        )
        .values("grupo_declaracao")
        .distinct()
        .count()
    ) + (
        Voto.objects.filter(
            assembleia=assembleia,
            votante_manual__isnull=False,
            status=Voto.Status.PENDENTE,
        )
        .values("votante_manual")
        .distinct()
        .count()
    )

    for questao in questoes:
        opcoes_resultado = []
        total_votos_questao = 0

        for opcao in questao.opcoes.annotate(
            votos_count=Count(
                "votos",
                filter=Q(votos__questao=questao)
                & Q(votos__status=Voto.Status.VALIDADO),
            )
        ):
            count = opcao.votos_count
            total_votos_questao += count
            opcoes_resultado.append(
                {
                    "id": str(opcao.id),
                    "texto": opcao.texto,
                    "votos": count,
                }
            )

        data.append(
            {
                "questao_id": str(questao.id),
                "questao_titulo": questao.titulo,
                "total_votos": total_votos_questao,
                "total_votantes": total_votantes,
                "percentual_participacao": (
                    round(total_votos_questao / total_votos_possiveis * 100, 1)
                    if total_votos_possiveis > 0
                    else 0
                ),
                "opcoes": opcoes_resultado,
                "procuracoes_pendentes": procuracoes_pendentes,
            }
        )

    return Response(data)


@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def unidades_assembleia(request, assembleia_id):
    """Lista pública (resumida) das unidades votantes, para seleção de
    voto por procuração. Retorna só nome/bloco/apto, sem dados sensíveis."""
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)
    votantes = assembleia.votantes.filter(bloqueado=False, inadimplente=False).order_by(
        "bloco", "apartamento"
    )
    data = [
        {
            "id": str(e.id),
            "nome": e.nome,
            "bloco": e.bloco,
            "apartamento": e.apartamento,
        }
        for e in votantes
    ]
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def procuracoes_pendentes(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    votos = (
        Voto.objects.filter(assembleia=assembleia, status=Voto.Status.PENDENTE)
        .filter(Q(por_procuracao=True) | Q(unidade_declarada=True))
        .select_related("eleitor", "procurador", "questao", "opcao_escolhida")
        .order_by(
            "decl_bloco", "decl_apartamento",
            "eleitor__bloco", "eleitor__apartamento", "questao__ordem",
        )
    )

    unidades = {}
    for v in votos:
        if v.unidade_declarada:
            key = f"decl:{v.grupo_declaracao}"
            if key not in unidades:
                unidades[key] = {
                    "id": str(v.grupo_declaracao or ""),
                    "tipo": "declarada",
                    "nome": v.decl_nome,
                    "bloco": v.decl_bloco,
                    "apartamento": v.decl_apartamento,
                    "procurador_nome": v.eleitor.nome,
                    "horario": v.timestamp,
                    "votos": [],
                }
        else:
            key = f"proc:{v.eleitor_id}"
            if key not in unidades:
                unidades[key] = {
                    "id": str(v.eleitor_id),
                    "tipo": "procuracao",
                    "nome": v.eleitor.nome,
                    "bloco": v.eleitor.bloco,
                    "apartamento": v.eleitor.apartamento,
                    "procurador_nome": v.procurador.nome if v.procurador else "",
                    "horario": v.timestamp,
                    "votos": [],
                }
        unidades[key]["votos"].append(
            {
                "questao": v.questao.titulo,
                "opcao": v.opcao_escolhida.texto,
            }
        )

    lista = list(unidades.values())
    return Response({"total_unidades": len(lista), "unidades": lista})


@api_view(["POST"])
@permission_classes([IsAdminWithRole])
def validar_procuracao(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    eleitor_id = request.data.get("eleitor_id")
    grupo = request.data.get("grupo_declaracao")
    acao = str(request.data.get("acao", "")).strip().lower()

    if (not eleitor_id and not grupo) or acao not in {"aprovar", "rejeitar"}:
        return Response(
            {"error": "Informe eleitor_id ou grupo_declaracao e acao (aprovar/rejeitar)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    novo_status = (
        Voto.Status.VALIDADO if acao == "aprovar" else Voto.Status.REJEITADO
    )
    if grupo:
        qs = Voto.objects.filter(
            assembleia=assembleia,
            grupo_declaracao=grupo,
            unidade_declarada=True,
            status=Voto.Status.PENDENTE,
        )
        alvo = f"grupo={grupo}"
    else:
        qs = Voto.objects.filter(
            assembleia=assembleia,
            eleitor_id=eleitor_id,
            por_procuracao=True,
            status=Voto.Status.PENDENTE,
        )
        alvo = f"eleitor={eleitor_id}"
    atualizados = qs.update(status=novo_status)

    audit.info(
        "procuracao_%s assembleia=%s %s votos=%s admin=%s",
        acao, assembleia.id, alvo, atualizados, request.user.id,
    )
    from apps.assembleias.audit import registrar_log
    from apps.assembleias.models import LogAuditoria
    registrar_log(
        request, assembleia,
        LogAuditoria.Acao.VALIDAR_PROCURACAO if acao == "aprovar"
        else LogAuditoria.Acao.REJEITAR_PROCURACAO,
        f"{atualizados} voto(s) por procuração {acao}(s).",
    )
    return Response({"status": novo_status, "votos_atualizados": atualizados})


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def relatorio_detalhado(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    votos = (
        Voto.objects.filter(assembleia=assembleia)
        .select_related("eleitor", "votante_manual", "questao", "opcao_escolhida")
        .order_by("-timestamp")
    )

    return Response(
        {
            "assembleia_id": str(assembleia.id),
            "assembleia_titulo": assembleia.titulo,
            "total_registros": votos.count(),
            "votos": RelatorioVotoSerializer(votos, many=True).data,
        }
    )


@ratelimit(key="ip", rate="30/m", block=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def verificar_voto(request):
    hash_voto = request.query_params.get("hash")
    if not hash_voto:
        return Response(
            {"error": "Parâmetro 'hash' é obrigatório"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    voto = (
        Voto.objects.filter(hash_voto=hash_voto)
        .select_related("assembleia", "questao")
        .first()
    )
    if voto is None:
        return Response(
            {"encontrado": False},
            status=status.HTTP_404_NOT_FOUND,
        )
    # Confirma a existência e o contexto do voto sem revelar quem votou ou
    # qual opção foi escolhida (preserva o sigilo do voto).
    return Response({
        "encontrado": True,
        "assembleia": voto.assembleia.titulo,
        "questao": voto.questao.titulo,
        "timestamp": voto.timestamp,
        "status": voto.get_status_display(),
    })

import hashlib
import logging
import re
import uuid

from django.db import transaction
from django_ratelimit.decorators import ratelimit

audit = logging.getLogger("audit")
from django.db.models import Count, F, Q, Sum
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
from apps.eleitores.models import (
    Eleitor,
    IdentidadeFacial,
    MENSAGEM_INADIMPLENTE,
    normalizar_unidade,
    unidade_inadimplente,
)
from apps.eleitores.facial import (
    LIMIAR_BUSCA,
    melhor_correspondencia,
    salvar_identidade_nova,
    tem_biometria,
    validar_descriptor,
    validar_lista_descriptors,
    verificar,
)
from core.permissions import IsAdminWithRole, get_user_condominios

from .models import VotanteManual, Voto
from .serializers import RelatorioVotoSerializer, VotoCreateSerializer


VOTE_AUTH_MAX_AGE_SECONDS = 900

# Controle dos bloqueios de voto durante a assembleia.
# Celular compartilhado liberado (vários moradores no mesmo aparelho podem
# votar), mas cada unidade vota só uma vez por questão.
BLOQUEAR_DISPOSITIVO = False
BLOQUEAR_UNIDADE = True


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


def get_client_user_agent(request):
    return str(request.META.get("HTTP_USER_AGENT", "")).strip()


AVISO_UNIDADE_JA_CADASTRADA = (
    "Já existe um cadastro dessa unidade. O seu cadastro não poderá votar; "
    "só será válido um voto por unidade."
)


def _aviso_unidade_ja_cadastrada(condominio_id, bloco, apartamento, criado_em, ident_id):
    """Retorna o aviso "1 voto por unidade" quando a mesma unidade já tinha um
    rosto cadastrado ANTES deste (por criado_em). Não bloqueia nada — só avisa a
    2ª pessoa da unidade que o voto dela não vale. Comparação tolerante de unidade
    ([[normalizar_unidade]]). Falha aberta: qualquer erro retorna sem aviso."""
    napto = normalizar_unidade(apartamento)
    if not condominio_id or not napto:
        return ""
    nbloco = normalizar_unidade(bloco)
    anteriores = (
        IdentidadeFacial.objects.filter(condominio_id=condominio_id)
        .exclude(id=ident_id)
    )
    if criado_em is not None:
        anteriores = anteriores.filter(criado_em__lt=criado_em)
    for e in anteriores.only("bloco", "apartamento"):
        if normalizar_unidade(e.apartamento) == napto and normalizar_unidade(e.bloco) == nbloco:
            return AVISO_UNIDADE_JA_CADASTRADA
    return ""


def _voto_unidade(v):
    """(bloco, apartamento) efetivos de um Voto, conforme o caminho: unidade
    declarada usa os campos digitados; voto manual usa o votante; senão o eleitor."""
    if v.unidade_declarada:
        return v.decl_bloco, v.decl_apartamento
    if v.votante_manual_id and v.votante_manual:
        return v.votante_manual.bloco, v.votante_manual.apartamento
    if v.eleitor_id and v.eleitor:
        return v.eleitor.bloco, v.eleitor.apartamento
    return "", ""


def _unidade_ja_votou(assembleia, questao, bloco, apartamento, *, excluir_eleitor_id=None, excluir_votante_id=None):
    """True se a unidade (comparada de forma normalizada, [[normalizar_unidade]])
    já tem um voto NÃO-rejeitado nesta questão por QUALQUER caminho (cadastro,
    manual ou declarada) — unifica os 3 subsistemas para honrar "1 voto por
    unidade / primeiro voto conta". Ignora os votos próprios do solicitante
    (para não se autobloquear). **Falha aberta:** sem unidade ou em erro,
    retorna False (nunca bloqueia um votante legítimo)."""
    napto = normalizar_unidade(apartamento)
    if not napto:
        return False
    nbloco = normalizar_unidade(bloco)
    try:
        qs = (
            Voto.objects.filter(assembleia=assembleia, questao=questao)
            .exclude(status=Voto.Status.REJEITADO)
            .select_related("eleitor", "votante_manual")
            .only(
                "eleitor_id",
                "votante_manual_id",
                "unidade_declarada",
                "por_procuracao",
                "decl_bloco",
                "decl_apartamento",
                "eleitor__bloco",
                "eleitor__apartamento",
                "votante_manual__bloco",
                "votante_manual__apartamento",
            )
        )
        for v in qs:
            if (
                excluir_eleitor_id
                and v.eleitor_id == excluir_eleitor_id
                and not v.unidade_declarada
                and not v.por_procuracao
            ):
                continue
            if excluir_votante_id and v.votante_manual_id == excluir_votante_id:
                continue
            vb, va = _voto_unidade(v)
            if normalizar_unidade(va) == napto and normalizar_unidade(vb) == nbloco:
                return True
        return False
    except Exception:
        audit.exception(
            "dedup_unidade falhou assembleia=%s questao=%s", assembleia.id, questao.id
        )
        return False


def _questoes_ja_votadas(assembleia, *, votante=None, eleitor=None):
    """Itens já votados por esta pessoa, separados por motivo:
    `proprias` (ela mesma ou o mesmo rosto) e `por_unidade` (outra pessoa da
    mesma unidade votou primeiro). Cada link (item) aceita um voto por morador, e
    a tela usa isto para explicar o bloqueio ANTES de mostrar a cédula de novo.
    **Falha aberta:** em erro devolve listas vazias (nunca impede um votante
    legítimo — o bloqueio real acontece ao registrar o voto)."""
    ident_id = getattr(votante, "identidade_facial_id", None)
    bloco = getattr(votante, "bloco", "") or getattr(eleitor, "bloco", "") or ""
    apartamento = (
        getattr(votante, "apartamento", "") or getattr(eleitor, "apartamento", "") or ""
    )
    napto = normalizar_unidade(apartamento)
    nbloco = normalizar_unidade(bloco)
    # Morador com mais de uma unidade (votos_permitidos) só fecha o item depois
    # de usar toda a cota dele naquele item.
    cota = max(1, (getattr(eleitor, "votos_permitidos", 1) or 1) if votante is None else 1)
    contagem, por_unidade = {}, set()
    try:
        # only(): esta varredura pega TODOS os votos da assembleia e é chamada por
        # cada morador ao abrir a tela — sem isto viriam junto selfie/assinatura
        # (base64) de cada voto, dezenas de MB no pico da votação.
        qs = (
            Voto.objects.filter(assembleia=assembleia)
            .exclude(status=Voto.Status.REJEITADO)
            .select_related("eleitor", "votante_manual")
            .only(
                "questao_id",
                "eleitor_id",
                "votante_manual_id",
                "unidade_declarada",
                "por_procuracao",
                "decl_bloco",
                "decl_apartamento",
                "eleitor__bloco",
                "eleitor__apartamento",
                "votante_manual__bloco",
                "votante_manual__apartamento",
                "votante_manual__identidade_facial",
            )
        )
        for v in qs:
            propria = False
            if votante is not None and v.votante_manual_id == votante.id:
                propria = True
            elif (
                eleitor is not None
                and v.eleitor_id == eleitor.id
                and not v.unidade_declarada
                and not v.por_procuracao
            ):
                propria = True
            elif (
                ident_id
                and v.votante_manual_id
                and v.votante_manual.identidade_facial_id == ident_id
            ):
                propria = True
            if propria:
                contagem[v.questao_id] = contagem.get(v.questao_id, 0) + 1
                continue
            if BLOQUEAR_UNIDADE and napto:
                vb, va = _voto_unidade(v)
                if normalizar_unidade(va) == napto and normalizar_unidade(vb) == nbloco:
                    por_unidade.add(v.questao_id)
    except Exception:
        audit.exception("questoes_ja_votadas falhou assembleia=%s", assembleia.id)
        return [], []
    proprias = {q for q, n in contagem.items() if n >= cota}
    return (
        [str(q) for q in proprias],
        [str(q) for q in por_unidade if q not in proprias],
    )


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
                    "error": MENSAGEM_INADIMPLENTE,
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
        if BLOQUEAR_DISPOSITIVO and device_id and not por_procuracao and not unidade_declarada:
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

        if not questao.liberada:
            return Response(
                {"error": "A votação deste item ainda não foi liberada. Aguarde a liberação pela administração."},
                status=status.HTTP_409_CONFLICT,
            )

        if unidade_declarada:
            # Unidade declarada não consome a cota própria do declarante.
            # Garante 1 voto por unidade declarada nesta questão e impede
            # declarar uma unidade que já votou (real ou outra declaração).
            # Sem select_for_update: o lock da Assembleia no início da transação
            # já serializa os votos, e FOR UPDATE não funciona nos LEFT JOINs
            # dos FKs anuláveis (eleitor/votante_manual).
            dup = _unidade_ja_votou(assembleia, questao, decl_bloco, decl_apartamento)
            if dup and BLOQUEAR_UNIDADE:
                return Response(
                    {"error": "Esta unidade já tem um voto nesta questão."},
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            # Idempotência (retry no 4G / duplo-clique): se este eleitor já atingiu
            # a cota de votos próprios nesta questão, devolve o 1º voto como SUCESSO
            # (não erro) — evita o susto "votei e não computou" seguido de re-voto.
            # Multi-unidade (votos_permitidos > 1) ainda pode votar até a cota.
            votos_permitidos = max(1, eleitor.votos_permitidos or 1)
            proprios = list(
                Voto.objects.select_for_update()
                .filter(
                    eleitor=eleitor,
                    questao=questao,
                    unidade_declarada=False,
                    por_procuracao=False,
                )
                .exclude(status=Voto.Status.REJEITADO)
                .order_by("timestamp")
            )
            if BLOQUEAR_UNIDADE and len(proprios) >= votos_permitidos:
                v0 = proprios[0]
                return Response(
                    {
                        "message": "Seu voto já estava registrado nesta questão.",
                        "hash_voto": v0.hash_voto,
                        "timestamp": v0.timestamp,
                        "ja_registrado": True,
                    },
                    status=status.HTTP_200_OK,
                )

        # Um voto por unidade (o primeiro voto da unidade conta): se OUTRA pessoa
        # da mesma unidade já votou nesta questão por QUALQUER caminho (cadastro,
        # manual ou declarada), bloqueia com aviso claro. O antigo "cadastro tem
        # prioridade" (que rebaixava o voto manual da unidade a pendente em
        # silêncio, sumindo da apuração) foi REMOVIDO — voto já dado não some;
        # o síndico revisa na apuração se necessário.
        if not por_procuracao and not unidade_declarada:
            if BLOQUEAR_UNIDADE and _unidade_ja_votou(
                assembleia,
                questao,
                eleitor.bloco,
                eleitor.apartamento,
                excluir_eleitor_id=eleitor.id,
            ):
                return Response(
                    {
                        "error": "Sua unidade já tem um voto nesta questão.",
                        "code": "ja_votou",
                    },
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

    # Inadimplência por unidade: o votante manual pode ter entrado e assistido,
    # mas a unidade marcada como inadimplente não vota.
    if unidade_inadimplente(assembleia.condominio_id, votante.bloco, votante.apartamento):
        return Response(
            {"error": MENSAGEM_INADIMPLENTE, "code": "inadimplente"},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Selo laranja: entrou na assembleia, mas algo não fechou (CPF fora da
    # planilha, unidade trocada na mão, rosto que não confirmou). Participa e
    # conta para o quórum; o voto só abre quando a mesa confere o documento.
    if votante.conferir_na_mesa:
        return Response(
            {
                "error": (
                    "Seu voto está aguardando a conferência da mesa. Procure a mesa "
                    "com um documento para liberar o voto da sua unidade."
                ),
                "code": "conferir_na_mesa",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if questao.encerrada:
        return Response(
            {"error": "A votação deste item foi encerrada."},
            status=status.HTTP_409_CONFLICT,
        )

    if not questao.liberada:
        return Response(
            {"error": "A votação deste item ainda não foi liberada. Aguarde a liberação pela administração."},
            status=status.HTTP_409_CONFLICT,
        )

    # Idempotência (retry no 4G / duplo-clique): se este votante já votou nesta
    # questão, devolve o voto existente como SUCESSO em vez de erro.
    ja = (
        Voto.objects.select_for_update()
        .filter(votante_manual=votante, questao=questao)
        .exclude(status=Voto.Status.REJEITADO)
        .order_by("timestamp")
        .first()
    )
    if ja and BLOQUEAR_UNIDADE:
        return Response(
            {
                "message": "Seu voto já estava registrado nesta questão.",
                "hash_voto": ja.hash_voto,
                "timestamp": ja.timestamp,
                "ja_registrado": True,
            },
            status=status.HTTP_200_OK,
        )

    # Um voto por unidade (o primeiro voto da unidade conta): se OUTRA pessoa da
    # mesma unidade já votou nesta questão por qualquer caminho, bloqueia com aviso
    # claro — sem criar voto pendente que engorda a apuração. Falha aberta: sem
    # unidade informada, não bloqueia ([[_unidade_ja_votou]]).
    if BLOQUEAR_UNIDADE and _unidade_ja_votou(
        assembleia, questao, votante.bloco, votante.apartamento, excluir_votante_id=votante.id
    ):
        return Response(
            {"error": "Sua unidade já tem um voto nesta questão.", "code": "ja_votou"},
            status=status.HTTP_409_CONFLICT,
        )

    device_id = (serializer.validated_data.get("device_id") or "").strip()

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
        status=Voto.Status.VALIDADO,
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


@api_view(["GET"])
@permission_classes([AllowAny])
def questoes_votadas(request, assembleia_id):
    """Itens em que quem está com este token de voto já votou. A tela de votação
    consulta ao entrar: se o link aberto for de um item já votado, mostra "você
    já votou neste item" em vez da cédula."""
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)
    try:
        auth_context = resolve_vote_auth_token(
            str(request.query_params.get("auth_token", "")), assembleia.id
        )
    except ValueError:
        return Response({"questoes": [], "por_unidade": []})

    votante = eleitor = None
    if auth_context.get("manual_id"):
        votante = VotanteManual.objects.filter(
            id=auth_context["manual_id"], assembleia=assembleia
        ).first()
    elif auth_context.get("eleitor_id"):
        eleitor = Eleitor.objects.filter(id=auth_context["eleitor_id"]).first()
    if votante is None and eleitor is None:
        return Response({"questoes": [], "por_unidade": []})

    proprias, por_unidade = _questoes_ja_votadas(
        assembleia, votante=votante, eleitor=eleitor
    )
    return Response({"questoes": proprias, "por_unidade": por_unidade})


# Mesmo motivo do acesso facial: o Wi-Fi do salão é um IP só.
@ratelimit(key="ip", rate="60/m", block=True)
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

    # Reaproveita o votante já criado nesta assembleia em vez de criar um novo a
    # cada entrada. Reentradas (facial que falhou e caiu no manual, página
    # recarregada, link reaberto) mintavam um votante novo por vez, o que furava
    # a deduplicação por votante e gerou votos repetidos (incidente 27/07: gente
    # com 2 e até 5 votos). Casa primeiro pelo mesmo aparelho+unidade e, na
    # falta, pela unidade+nome normalizados. Fail open: se nada casar, cria como
    # antes.
    napto = normalizar_unidade(apartamento)
    nbloco = normalizar_unidade(bloco)
    nnome = re.sub(r"\s+", " ", nome).strip().lower()

    def _mesmo_nome(v):
        return re.sub(r"\s+", " ", v.nome or "").strip().lower() == nnome

    votante = None
    if device_id:
        for v in VotanteManual.objects.filter(
            assembleia=assembleia, device_id=device_id
        ).order_by("criado_em"):
            vapto = normalizar_unidade(v.apartamento)
            if not vapto or (vapto == napto and normalizar_unidade(v.bloco) == nbloco):
                votante = v
                break
    if votante is None and napto:
        for v in VotanteManual.objects.filter(assembleia=assembleia).order_by(
            "criado_em"
        ):
            if (
                normalizar_unidade(v.apartamento) == napto
                and normalizar_unidade(v.bloco) == nbloco
                and _mesmo_nome(v)
            ):
                votante = v
                break

    reutilizou = votante is not None
    if votante is None:
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
    else:
        # Mesma pessoa reentrando: completa dados úteis sem duplicar o registro.
        mudou = []
        if device_id and not votante.device_id:
            votante.device_id = device_id
            mudou.append("device_id")
        if selfie and not votante.selfie:
            votante.selfie = selfie
            mudou.append("selfie")
        if mudou:
            votante.save(update_fields=mudou)

    # Presença: só na primeira entrada desta pessoa, para não duplicar linha na
    # lista de presença a cada reentrada.
    if not reutilizou:
        Presenca.objects.create(
            assembleia=assembleia,
            eleitor=None,
            nome=nome,
            bloco=bloco,
            apartamento=apartamento,
            metodo_auth="selfie",
            selfie=selfie,
            ip_address=get_client_ip(request),
            user_agent=user_agent,
            device_info=infer_device_info(user_agent),
        )

    # Aviso "1 voto por unidade": se a mesma unidade já tinha outro votante
    # (outra pessoa) registrado antes, avisa que só o 1º voto da unidade conta.
    # Não bloqueia a presença — a pessoa participa normalmente (quórum).
    aviso_unidade = ""
    if napto:
        for v in VotanteManual.objects.filter(assembleia=assembleia).exclude(id=votante.id):
            if v.criado_em and votante.criado_em and v.criado_em >= votante.criado_em:
                continue
            if (
                normalizar_unidade(v.apartamento) == napto
                and normalizar_unidade(v.bloco) == nbloco
            ):
                aviso_unidade = AVISO_UNIDADE_JA_CADASTRADA
                break

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
            "aviso_unidade": aviso_unidade,
            "token": token,
        },
        status=status.HTTP_201_CREATED,
    )


# O que o morador lê quando entra na votação com selo laranja. Ele participa da
# assembleia normalmente; o que espera a mesa é o voto da unidade. Todos os
# textos explicam o motivo em português, sem jargão e sem dar a entender que o
# morador fez algo errado.
AVISOS_CONFERENCIA = {
    "unidade_alterada": (
        "Você está na assembleia. Como a unidade que você informou está diferente "
        "da planilha da administradora, a mesa precisa conferir antes de liberar o "
        "seu voto. Procure a mesa com um documento."
    ),
    "rosto_nao_confere": (
        "Você está na assembleia. Não deu para confirmar pelo rosto — sua foto fica "
        "como comprovante e a mesa libera o voto depois de conferir seu documento."
    ),
    "sem_cadastro": (
        "Você está na assembleia. Seu CPF não consta na planilha de moradores "
        "enviada pela administradora, então a mesa vai conferir antes de liberar o "
        "voto. Procure a administração do seu condomínio para atualizar o cadastro."
    ),
    "rosto_ambiguo": (
        "Você está na assembleia. O sistema não teve certeza de quem era e preferiu "
        "não registrar um nome errado — procure a mesa para liberar o seu voto."
    ),
    "sem_cpf": (
        "Você está na assembleia. Como você entrou sem informar o CPF, a mesa "
        "confere seus dados antes de liberar o voto da unidade. Procure a mesa com "
        "um documento."
    ),
    "padrao": (
        "Você está na assembleia. A mesa precisa conferir seus dados antes de "
        "liberar o voto da sua unidade. Procure a mesa com um documento."
    ),
}

MENSAGEM_CPF_FORA_DA_PLANILHA = (
    "Seu CPF não consta na planilha de moradores. Verifique junto à administração "
    "do seu condomínio ou sua administradora, porque seu nome não consta na relação."
)


@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def consultar_cpf_votacao(request, assembleia_id):
    """Morador digita o CPF para entrar na votação; devolve as unidades ligadas a
    esse CPF no condomínio da assembleia. Recebe já o hash (o CPF nunca trafega em
    texto) e não expõe e-mail nem nenhum outro dado do morador."""
    assembleia = get_object_or_404(Assembleia, id=assembleia_id)
    cpf_hash = str(request.data.get("cpf_hash", "")).strip().lower()
    if len(cpf_hash) != 64 or any(c not in "0123456789abcdef" for c in cpf_hash):
        return Response({"error": "CPF inválido."}, status=status.HTTP_400_BAD_REQUEST)
    if not assembleia.condominio_id:
        return Response({"unidades": [], "encontrado": False, "tem_rosto": False})

    unidades = list(
        Eleitor.objects.filter(
            condominio_id=assembleia.condominio_id, cpf_hash=cpf_hash
        )
        .order_by("bloco", "apartamento")
        .values("nome", "bloco", "apartamento", "perfil")
    )
    # Já tem rosto guardado? Então a etapa seguinte é só CONFIRMAR que é a mesma
    # pessoa (um-contra-um). Se não tem, a foto de agora vira o cadastro dele.
    tem_rosto = IdentidadeFacial.objects.filter(
        condominio_id=assembleia.condominio_id, cpf_hash=cpf_hash
    ).exists()
    return Response(
        {
            "unidades": unidades,
            "encontrado": bool(unidades),
            "tem_rosto": tem_rosto,
            "mensagem": "" if unidades else MENSAGEM_CPF_FORA_DA_PLANILHA,
        }
    )


# Numa assembleia presencial todos entram pelo mesmo Wi-Fi (um único IP): o
# limite tem de caber a sala inteira chegando junto, não uma pessoa por vez.
@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def acesso_facial(request, assembleia_id):
    """Entrada da votação pelo rosto.

    Com CPF (caminho normal): o CPF diz quem é a pessoa e o rosto só confirma,
    numa comparação um-contra-um. Foi a inversão que acabou com a troca de nomes
    da assembleia de 08/08/2026 — não existe mais escolher um nome entre centenas
    de rostos parecidos, só responder sim ou não a uma pergunta.

    Sem CPF (condomínio sem planilha): ainda procura entre todos, mas com limiar
    rígido e recusa em caso de empate; na dúvida entra com selo laranja para a
    mesa conferir, em vez de chutar um nome.
    """
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

    # O rosto deixou de ser obrigatório: quando a câmera não lê (contraluz do
    # salão, óculos, tremor), a selfie entra no lugar e a mesa confere. Ninguém
    # fica de fora da assembleia por causa da câmera.
    descriptor = validar_descriptor(request.data.get("descriptor"))
    leituras = validar_lista_descriptors(request.data.get("descriptors"))
    if descriptor is not None:
        if descriptor not in leituras:
            leituras = [descriptor, *leituras][:5]
    elif leituras:
        descriptor = leituras[0]

    cpf_hash = str(request.data.get("cpf_hash", "")).strip().lower()
    if len(cpf_hash) != 64 or any(c not in "0123456789abcdef" for c in cpf_hash):
        cpf_hash = ""

    if descriptor is None and not cpf_hash:
        return Response(
            {"error": "Não foi possível ler o rosto. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    perfis_validos = {"proprietario", "locatario", "conjuge", "procurador", "outro"}
    nome = str(request.data.get("nome", "")).strip()[:200]
    bloco = str(request.data.get("bloco", "")).strip()[:20]
    apartamento = str(request.data.get("apartamento", "")).strip()[:20]
    perfil = str(request.data.get("perfil", "")).strip().lower()
    if perfil not in perfis_validos:
        perfil = "proprietario"
    selfie = str(request.data.get("selfie", ""))
    if len(selfie) > 3_500_000:
        return Response(
            {"error": "Imagem muito grande."}, status=status.HTTP_400_BAD_REQUEST
        )

    ident = None
    novo = False
    conferir = False
    motivo = ""
    dist_medida = None
    unidade_original = ""

    if cpf_hash:
        # ---- Caminho normal: o CPF confirma quem é, o rosto só valida. ----
        ident = (
            IdentidadeFacial.objects.filter(
                condominio_id=assembleia.condominio_id, cpf_hash=cpf_hash
            )
            .order_by("criado_em")
            .first()
        )
        unidades_planilha = list(
            Eleitor.objects.filter(
                condominio_id=assembleia.condominio_id, cpf_hash=cpf_hash
            ).values("nome", "bloco", "apartamento")
        )
        if not nome:
            return Response(
                {"error": "Informe o nome."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not apartamento:
            return Response(
                {"error": "Informe seu apartamento/unidade."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not unidades_planilha:
            # CPF fora da relação da administradora: entra assim mesmo e fica
            # visível para a mesa, em vez de barrar quem é morador de fato.
            conferir, motivo = True, "sem_cadastro"
        else:
            # A unidade é o único dado que decide direito a voto: se o morador
            # mudou a unidade em relação à planilha, entra, mas passa pela mesa.
            alvo = (normalizar_unidade(bloco), normalizar_unidade(apartamento))
            casou = any(
                (normalizar_unidade(u["bloco"]), normalizar_unidade(u["apartamento"]))
                == alvo
                for u in unidades_planilha
            )
            if not casou:
                conferir, motivo = True, "unidade_alterada"
                u0 = unidades_planilha[0]
                unidade_original = f"{u0['bloco']} {u0['apartamento']}".strip()[:60]

        if descriptor is None and not conferir:
            # Entrou pela selfie porque a câmera não leu o rosto. Não há vetor
            # para conferir, então a foto vale como comprovante e a mesa olha o
            # documento. Vale também no primeiro cadastro: antes, quem ainda não
            # tinha rosto guardado entrava sem nenhuma conferência.
            conferir, motivo = True, "rosto_nao_confere"

        if ident is not None:
            if descriptor is not None and not tem_biometria(ident):
                # Cadastro antigo feito só com selfie: não existe vetor guardado
                # para comparar. A leitura boa de agora vira o cadastro, em vez
                # de marcar "rosto não confere" em toda assembleia, para sempre.
                for v in leituras or [descriptor]:
                    ident.guardar_leitura(v)
            elif descriptor is not None:
                confere, d = verificar(descriptor, ident)
                dist_medida = None if d == float("inf") else round(d, 4)
                if confere:
                    # Acertou: guarda esta leitura para reconhecer melhor da
                    # próxima vez (luz e ângulo diferentes do cadastro).
                    ident.guardar_leitura(descriptor)
                elif not conferir:
                    conferir, motivo = True, "rosto_nao_confere"
            ident.nome = nome or ident.nome
            ident.bloco = bloco or ident.bloco
            ident.apartamento = apartamento or ident.apartamento
            ident.perfil = perfil
            if selfie and not ident.selfie:
                ident.selfie = selfie
            ident.save()
        else:
            # Primeira assembleia deste CPF: a foto de agora vira o cadastro.
            if not bool(request.data.get("consentimento_lgpd")):
                return Response(
                    {"error": "É necessário concordar com o uso dos dados (LGPD)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ident = IdentidadeFacial(
                condominio_id=assembleia.condominio_id,
                cpf_hash=cpf_hash,
                nome=nome,
                bloco=bloco,
                apartamento=apartamento,
                perfil=perfil,
                descriptor=descriptor or [],
                selfie=selfie,
                consentimento_lgpd=True,
                consentimento_em=timezone.now(),
            )
            # Se outro envio do mesmo morador chegou primeiro (duplo clique, duas
            # abas), aproveita o cadastro dele em vez de criar um segundo.
            ident, novo = salvar_identidade_nova(ident, leituras)
    else:
        # ---- Condomínio sem planilha de CPF: só aqui ainda procuramos o rosto
        # entre todos, com limiar rígido e recusa em caso de empate.
        # Se o condomínio TEM a planilha com CPF, quem chegou aqui usou o botão
        # "não tenho o CPF em mãos" e pulou a conferência que evita a troca de
        # nomes. Entra do mesmo jeito, mas com selo laranja para a mesa.
        if (
            Eleitor.objects.filter(condominio_id=assembleia.condominio_id)
            .exclude(cpf_hash__isnull=True)
            .exclude(cpf_hash="")
            .exists()
        ):
            conferir, motivo = True, "sem_cpf"
        identidades = IdentidadeFacial.objects.filter(
            condominio_id=assembleia.condominio_id
        ).defer("selfie")
        ident, d = melhor_correspondencia(descriptor, identidades)
        dist_medida = None if d == float("inf") else round(d, 4)
        if ident is None and d < LIMIAR_BUSCA + 0.1:
            # Chegou perto de alguém mas sem certeza: não chuta um nome.
            conferir, motivo = True, "rosto_ambiguo"

    # Sem CPF a foto é obrigatória: ninguém entra sem deixar o rosto registrado
    # para a mesa conferir com o documento. A primeira leitura, que só pergunta
    # se o rosto já é conhecido, continua passando sem foto.
    if not cpf_hash and (ident is not None or nome) and not selfie.startswith("data:image/"):
        return Response(
            {
                "error": (
                    "Para entrar sem informar o CPF é preciso tirar a foto. "
                    "A mesa confere o rosto com o documento."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if ident is None:
        # Rosto desconhecido: sem nome, avisa o front que precisa do 1º cadastro.
        if not nome:
            return Response({"encontrado": False}, status=status.HTTP_200_OK)
        if not bool(request.data.get("consentimento_lgpd")):
            return Response(
                {"error": "É necessário concordar com o uso dos dados (LGPD)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not apartamento:
            return Response(
                {"error": "Informe seu apartamento/unidade."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Anti-duplo-clique / recadastro: se a mesma unidade+nome já tem
        # identidade no condomínio (dois cliques rápidos, ou o rosto não casou
        # por variação de luz), reaproveita em vez de criar outra identidade.
        napto = normalizar_unidade(apartamento)
        nbloco = normalizar_unidade(bloco)
        nnome = re.sub(r"\s+", " ", nome).strip().lower()
        existente = None
        if napto:
            for e in IdentidadeFacial.objects.filter(
                condominio_id=assembleia.condominio_id
            ):
                if (
                    normalizar_unidade(e.apartamento) == napto
                    and normalizar_unidade(e.bloco) == nbloco
                    and re.sub(r"\s+", " ", e.nome or "").strip().lower() == nnome
                ):
                    existente = e
                    break
        if existente is not None:
            ident = existente
        else:
            ident = IdentidadeFacial(
                condominio_id=assembleia.condominio_id,
                nome=nome,
                bloco=bloco,
                apartamento=apartamento,
                perfil=perfil,
                descriptor=descriptor or [],
                selfie=selfie,
                consentimento_lgpd=True,
                consentimento_em=timezone.now(),
            )
            for v in leituras:
                ident.guardar_leitura(v)
            ident.save()
            novo = True
    elif not cpf_hash and descriptor is not None and not novo:
        # Reconhecido com folga pelo rosto: aprende esta leitura também.
        ident.guardar_leitura(descriptor)
        ident.save(update_fields=["descriptors"])

    # 1 votante por rosto por assembleia (reaproveita quem já entrou antes).
    user_agent = get_client_user_agent(request)
    # Vale a foto de hoje: é ela que mostra quem está na porta agora. A do
    # cadastro só entra quando esta chegada não trouxe foto nenhuma.
    selfie_ident = selfie if selfie.startswith("data:image/") else (
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
            conferir_na_mesa=conferir,
            motivo_conferencia=motivo,
            distancia_facial=dist_medida,
            unidade_original=unidade_original,
        ),
    )
    if (
        not criado
        and conferir
        and not votante.conferir_na_mesa
        and votante.conferido_em is None
    ):
        # Já tinha entrado antes sem pendência, mas a entrada de agora não
        # confere (rosto que não bate, unidade trocada na mão). Sem isto, quem
        # chegasse depois com o CPF de outro morador herdava a entrada limpa da
        # primeira pessoa e saía com o voto liberado. Se a mesa já conferiu o
        # documento (conferido_em preenchido), o selo não volta — senão o
        # morador seria barrado de novo a cada recarga da página.
        votante.conferir_na_mesa = True
        votante.motivo_conferencia = motivo
        votante.unidade_original = unidade_original or votante.unidade_original
        if dist_medida is not None:
            votante.distancia_facial = dist_medida
        votante.save(
            update_fields=[
                "conferir_na_mesa",
                "motivo_conferencia",
                "unidade_original",
                "distancia_facial",
            ]
        )

    if criado:
        Presenca.objects.create(
            assembleia=assembleia,
            eleitor=None,
            nome=votante.nome,
            bloco=votante.bloco,
            apartamento=votante.apartamento,
            metodo_auth=(
                "cpf_facial"
                if cpf_hash and descriptor is not None
                else "cpf"
                if cpf_hash
                else "facial"
                if descriptor is not None
                else "selfie"
            ),
            selfie=selfie_ident,
            assinatura_facial=(
                hashlib.sha256(str(descriptor).encode()).hexdigest()
                if descriptor is not None
                else ""
            ),
            ip_address=get_client_ip(request),
            user_agent=user_agent,
            device_info=infer_device_info(user_agent),
        )
    if not novo:
        ident.save(update_fields=["ultimo_visto_em"])

    # Aviso "1 voto por unidade": se a unidade já tinha um cadastro/rosto mais
    # antigo no condomínio, informa que só um voto por unidade conta. Não
    # bloqueia a presença — a pessoa participa normalmente (quórum).
    aviso_unidade = _aviso_unidade_ja_cadastrada(
        assembleia.condominio_id, ident.bloco, ident.apartamento, ident.criado_em, ident.id
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
        "acesso_facial assembleia=%s votante=%s ident=%s novo=%s cpf=%s conferir=%s(%s)",
        assembleia.id, votante.id, ident.id, novo, bool(cpf_hash),
        votante.conferir_na_mesa, votante.motivo_conferencia,
    )
    return Response(
        {
            "encontrado": True,
            "authenticated": True,
            "method": "cpf_facial" if cpf_hash else "facial",
            "novo": novo,
            "nome": votante.nome,
            "votante_manual_id": str(votante.id),
            "aviso_unidade": aviso_unidade,
            "conferir_na_mesa": votante.conferir_na_mesa,
            "motivo_conferencia": votante.motivo_conferencia,
            "aviso_conferencia": (
                AVISOS_CONFERENCIA.get(
                    votante.motivo_conferencia, AVISOS_CONFERENCIA["padrao"]
                )
                if votante.conferir_na_mesa
                else ""
            ),
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
                "inadimplente": votante.inadimplente,
                "conferir_na_mesa": votante.conferir_na_mesa,
                "motivo_conferencia": votante.motivo_conferencia,
                "unidade_original": votante.unidade_original,
                "conferido_em": votante.conferido_em,
                "conferido_por": votante.conferido_por,
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

    if not votante_id or acao not in {
        "aprovar", "rejeitar", "inadimplente", "regularizar", "conferir",
    }:
        return Response(
            {
                "error": "Informe votante_manual_id e acao "
                "(aprovar/rejeitar/inadimplente/regularizar/conferir)"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    votante = get_object_or_404(VotanteManual, id=votante_id, assembleia=assembleia)

    # Botão "Conferido" da mesa: apaga o selo laranja e libera o voto da unidade.
    # Quem conferiu fica registrado, para a ata responder quem autorizou.
    if acao == "conferir":
        votante.conferir_na_mesa = False
        votante.conferido_em = timezone.now()
        votante.conferido_por = (
            getattr(request.user, "get_full_name", lambda: "")()
            or getattr(request.user, "email", "")
            or str(request.user)
        )[:200]
        votante.save(
            update_fields=["conferir_na_mesa", "conferido_em", "conferido_por"]
        )
        audit.info(
            "votante_conferido assembleia=%s votante=%s por=%s",
            assembleia.id, votante.id, votante.conferido_por,
        )
        return Response(
            {
                "message": "Voto liberado. A unidade já pode votar.",
                "votante_manual_id": str(votante.id),
                "conferir_na_mesa": False,
            }
        )

    # Botão "Inadimplente" do painel: invalida os votos e deixa a unidade
    # impedida de votar de novo, sem tocar na marcação vinda da planilha
    # (aquela mora no Eleitor). Por isso é reversível em "regularizar".
    if acao in {"inadimplente", "regularizar"}:
        marcar = acao == "inadimplente"
        estava_inadimplente = votante.inadimplente
        votante.inadimplente = marcar
        votante.save(update_fields=["inadimplente"])

        if marcar:
            # Guarda o status original (validado ou pendente) antes de invalidar,
            # para que "regularizar" devolva o voto exatamente como estava.
            atualizados = (
                Voto.objects.filter(assembleia=assembleia, votante_manual=votante)
                .exclude(status=Voto.Status.REJEITADO)
                .update(
                    status_pre_inadimplencia=F("status"),
                    status=Voto.Status.REJEITADO,
                )
            )
        else:
            rejeitados = Voto.objects.filter(
                assembleia=assembleia,
                votante_manual=votante,
                status=Voto.Status.REJEITADO,
            )
            atualizados = rejeitados.exclude(status_pre_inadimplencia="").update(
                status=F("status_pre_inadimplencia"),
                status_pre_inadimplencia="",
            )
            if estava_inadimplente:
                # Votos invalidados antes de existir o registro do status
                # anterior: sem essa volta eles ficariam fora da apuração
                # para sempre, mesmo com a inadimplência removida.
                atualizados += rejeitados.filter(status_pre_inadimplencia="").update(
                    status=Voto.Status.VALIDADO
                )

        # A mesma pessoa costuma estar na lista de presença: realça lá também.
        na = normalizar_unidade(votante.apartamento)
        nb = normalizar_unidade(votante.bloco)
        for p in assembleia.presencas.all().only("bloco", "apartamento", "inadimplente"):
            if normalizar_unidade(p.apartamento) == na and normalizar_unidade(p.bloco) == nb:
                if p.inadimplente != marcar:
                    p.inadimplente = marcar
                    p.save(update_fields=["inadimplente"])

        audit.info(
            "voto_manual_%s assembleia=%s votante=%s votos=%s admin=%s",
            acao, assembleia.id, votante.id, atualizados, request.user.id,
        )
        from apps.assembleias.audit import registrar_log
        from apps.assembleias.models import LogAuditoria
        registrar_log(
            request, assembleia,
            LogAuditoria.Acao.REJEITAR_PROCURACAO if marcar
            else LogAuditoria.Acao.VALIDAR_PROCURACAO,
            f"{votante.nome} ({votante.bloco}/{votante.apartamento}): "
            + (
                f"marcado como INADIMPLENTE, {atualizados} voto(s) invalidado(s)."
                if marcar
                else f"inadimplência removida, {atualizados} voto(s) devolvido(s) à contagem."
            ),
        )
        return Response(
            {
                "status": "inadimplente" if marcar else "regular",
                "votos_atualizados": atualizados,
            }
        )

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
    # Só faz sentido pedir o CPF quando este condomínio tem moradores importados
    # (com CPF). Sem planilha, a tela vai direto para a facial.
    tem_cpf = bool(
        assembleia.condominio_id
        and Eleitor.objects.filter(condominio_id=assembleia.condominio_id)
        .exclude(cpf_hash__isnull=True)
        .exclude(cpf_hash="")
        .exists()
    )
    return Response(
        {
            "id": str(assembleia.id),
            "titulo": assembleia.titulo,
            "tem_cpf": tem_cpf,
            "descricao": assembleia.descricao,
            "status": assembleia.status,
            "votacao_liberada": assembleia.votacao_liberada,
            "link_reuniao": assembleia.link_reuniao,
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
        # Puxa os votos validados da questão de uma vez, resolvendo a identidade
        # (eleitor / votante manual / unidade declarada). Este endpoint é
        # admin-only (IsAdminWithRole), então pode expor QUEM votou em cada
        # opção — o morador usa /votacao-publica, que não devolve nada disso.
        votos_q = (
            Voto.objects.filter(questao=questao, status=Voto.Status.VALIDADO)
            .select_related("eleitor", "votante_manual", "opcao_escolhida")
        )
        votantes_por_opcao = {}  # opcao_id -> [ {nome, bloco, apartamento} ]
        pessoas = set()  # chave única por pessoa, p/ separar pessoas x votos(peso)
        for v in votos_q:
            if v.eleitor_id:
                nome = v.eleitor.nome
                bloco = v.eleitor.bloco
                apto = v.eleitor.apartamento
                pessoa_key = f"e:{v.eleitor_id}"
            elif v.votante_manual_id:
                nome = v.votante_manual.nome
                bloco = v.votante_manual.bloco
                apto = v.votante_manual.apartamento
                pessoa_key = f"m:{v.votante_manual_id}"
            else:
                nome = v.decl_nome or ""
                bloco = v.decl_bloco or ""
                apto = v.decl_apartamento or ""
                pessoa_key = f"d:{v.grupo_declaracao or v.id}"
            pessoas.add(pessoa_key)
            votantes_por_opcao.setdefault(str(v.opcao_escolhida_id), []).append(
                {"nome": nome, "bloco": bloco, "apartamento": apto}
            )

        opcoes_resultado = []
        total_votos_questao = 0
        for opcao in questao.opcoes.order_by("ordem", "id"):
            votantes_op = votantes_por_opcao.get(str(opcao.id), [])
            votantes_op.sort(key=lambda x: (x["bloco"], x["apartamento"], x["nome"]))
            count = len(votantes_op)
            total_votos_questao += count
            opcoes_resultado.append(
                {
                    "id": str(opcao.id),
                    "texto": opcao.texto,
                    "votos": count,
                    "votantes": votantes_op,
                }
            )

        total_pessoas = len(pessoas)
        # Abstenções: votantes que registraram presença mas não votaram nesta
        # questão. Base = pessoas presentes/aptas (total_votantes), nunca negativa.
        abstencoes = max(total_votantes - total_pessoas, 0)

        data.append(
            {
                "questao_id": str(questao.id),
                "questao_titulo": questao.titulo,
                "encerrada": questao.encerrada,
                "total_votos": total_votos_questao,
                "total_pessoas": total_pessoas,
                "total_votantes": total_votantes,
                "abstencoes": abstencoes,
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
    # A lista traz nomes e unidades de moradores: só faz sentido enquanto a
    # votação está aberta (é quando a tela de procuração existe). Fora disso a
    # rota virava um catálogo de moradores para quem tivesse o link.
    if assembleia.status != Assembleia.Status.ABERTA:
        return Response([])
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

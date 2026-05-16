import logging

from django.db import transaction
from django_ratelimit.decorators import ratelimit

audit = logging.getLogger("audit")
from django.db.models import Count, Q
from django.http import Http404
from django.utils import timezone
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.assembleias.models import Assembleia, OpcaoVoto, Questao
from apps.eleitores.models import Eleitor
from core.permissions import IsAdminWithRole, get_user_condominios

from .models import Voto
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


@ratelimit(key="ip", rate="30/m", block=True)
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

        eleitor_id = auth_context["eleitor_id"]
        request_eleitor_id = serializer.validated_data.get("eleitor_id")
        if request_eleitor_id and str(request_eleitor_id) != eleitor_id:
            return Response(
                {"error": "Token de autenticação não corresponde ao eleitor informado"},
                status=status.HTTP_403_FORBIDDEN,
            )

        eleitor = get_object_or_404(Eleitor, id=eleitor_id)

        if not assembleia.votantes.filter(id=eleitor.id).exists():
            return Response(
                {"error": "Eleitor não está na lista de votantes desta assembleia"},
                status=status.HTTP_403_FORBIDDEN,
            )

        questao = get_object_or_404(
            Questao, id=serializer.validated_data["questao_id"], assembleia=assembleia
        )
        opcao = get_object_or_404(
            OpcaoVoto, id=serializer.validated_data["opcao_id"], questao=questao
        )

        if Voto.objects.select_for_update().filter(eleitor=eleitor, questao=questao).exists():
            return Response(
                {"error": "Você já votou nesta questão"},
                status=status.HTTP_409_CONFLICT,
            )

        voto = Voto(
            assembleia=assembleia,
            eleitor=eleitor,
            questao=questao,
            opcao_escolhida=opcao,
            metodo_auth=auth_context["metodo_auth"],
            ip_address=get_client_ip(request),
            user_agent=get_client_user_agent(request),
            device_info=infer_device_info(get_client_user_agent(request)),
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


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def resultados(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    questoes = assembleia.questoes.prefetch_related(
        "opcoes__votos"
    ).all()

    data = []
    total_votantes = assembleia.votantes.count()

    for questao in questoes:
        opcoes_resultado = []
        total_votos_questao = 0

        for opcao in questao.opcoes.annotate(
            votos_count=Count("votos", filter=Q(votos__questao=questao))
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
                    round(total_votos_questao / total_votantes * 100, 1)
                    if total_votantes > 0
                    else 0
                ),
                "opcoes": opcoes_resultado,
            }
        )

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAdminWithRole])
def relatorio_detalhado(request, assembleia_id):
    assembleia = get_accessible_assembleia(request, assembleia_id)
    votos = (
        Voto.objects.filter(assembleia=assembleia)
        .select_related("eleitor", "questao", "opcao_escolhida")
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

    existe = Voto.objects.filter(hash_voto=hash_voto).exists()
    if not existe:
        return Response(
            {"encontrado": False},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response({"encontrado": True})

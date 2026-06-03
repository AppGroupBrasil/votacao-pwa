from django.db.models import Count
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.permissions import IsAdminWithRole, get_user_condominios

from .models import Enquete, EnqueteOpcao, EnqueteVoto
from .serializers import EnqueteSerializer


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class EnqueteViewSet(viewsets.ModelViewSet):
    serializer_class = EnqueteSerializer
    permission_classes = [IsAdminWithRole]

    def get_queryset(self):
        qs = Enquete.objects.prefetch_related("opcoes").all()
        condominios = get_user_condominios(self.request.user)
        if condominios is None:
            return qs
        return qs.filter(condominio__in=condominios)


def _resultado_payload(enquete):
    opcoes = list(
        enquete.opcoes.annotate(qtd=Count("votos")).order_by("ordem")
    )
    total = sum(o.qtd for o in opcoes)
    itens = [
        {
            "id": str(o.id),
            "texto": o.texto,
            "votos": o.qtd,
            "percentual": round(o.qtd * 100 / total, 1) if total else 0,
        }
        for o in opcoes
    ]
    vencedor = None
    if total:
        top = max(itens, key=lambda i: i["votos"])
        if top["votos"] > 0:
            vencedor = top
    return {
        "id": str(enquete.id),
        "titulo": enquete.titulo,
        "ativa": enquete.ativa,
        "total_votos": total,
        "opcoes": itens,
        "vencedor": vencedor,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="60/m", block=True)
def enquete_publica(request, enquete_id):
    try:
        enquete = Enquete.objects.prefetch_related("opcoes").get(id=enquete_id)
    except Enquete.DoesNotExist:
        return Response(
            {"error": "Enquete não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {
            "id": str(enquete.id),
            "titulo": enquete.titulo,
            "ativa": enquete.ativa,
            "opcoes": [
                {"id": str(o.id), "texto": o.texto} for o in enquete.opcoes.all()
            ],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="60/m", block=True)
def resultado_enquete(request, enquete_id):
    try:
        enquete = Enquete.objects.prefetch_related("opcoes").get(id=enquete_id)
    except Enquete.DoesNotExist:
        return Response(
            {"error": "Enquete não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(_resultado_payload(enquete))


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="20/m", block=True)
def votar_enquete(request, enquete_id):
    try:
        enquete = Enquete.objects.get(id=enquete_id)
    except Enquete.DoesNotExist:
        return Response(
            {"error": "Enquete não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not enquete.ativa:
        return Response(
            {"error": "Esta enquete está encerrada."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    opcao_id = request.data.get("opcao_id")
    if not opcao_id:
        return Response(
            {"error": "Selecione uma resposta."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        opcao = enquete.opcoes.get(id=opcao_id)
    except EnqueteOpcao.DoesNotExist:
        return Response(
            {"error": "Resposta inválida."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    device_id = str(request.data.get("device_id", "")).strip()[:64]
    if device_id and EnqueteVoto.objects.filter(
        enquete=enquete, device_id=device_id
    ).exists():
        return Response(
            {"error": "Você já votou nesta enquete."},
            status=status.HTTP_409_CONFLICT,
        )

    EnqueteVoto.objects.create(
        enquete=enquete,
        opcao=opcao,
        device_id=device_id,
        ip_address=get_client_ip(request),
    )
    return Response(_resultado_payload(enquete), status=status.HTTP_201_CREATED)

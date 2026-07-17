from django.db import IntegrityError
from django.db.models import Count
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.permissions import IsAdminWithRole, get_user_condominios

from .models import (
    Enquete,
    EnqueteOpcao,
    EnqueteVoto,
    ListaPresenca,
    PresencaManual,
)
from .serializers import (
    EnqueteSerializer,
    ListaPresencaSerializer,
    PresencaManualSerializer,
)


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


@api_view(["GET"])
@permission_classes([AllowAny])
def resolver_codigo_enquete(request, codigo):
    """Endpoint público: resolve o código curto do link (/v/<codigo>) para o id da enquete."""
    try:
        enquete = Enquete.objects.only("id").get(codigo_curto=codigo.upper())
    except Enquete.DoesNotExist:
        return Response(
            {"error": "Código não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    return Response({"enquete_id": str(enquete.id)})


@api_view(["GET"])
@permission_classes([AllowAny])
def resolver_codigo_lista(request, codigo):
    """Endpoint público: resolve o código curto (/v/<codigo>) para o id da lista de presença."""
    try:
        lista = ListaPresenca.objects.only("id").get(codigo_curto=codigo.upper())
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Código não encontrado."}, status=status.HTTP_404_NOT_FOUND
        )
    return Response({"lista_id": str(lista.id)})


class EnqueteViewSet(viewsets.ModelViewSet):
    serializer_class = EnqueteSerializer
    permission_classes = [IsAdminWithRole]

    def get_queryset(self):
        qs = Enquete.objects.prefetch_related("opcoes").all()
        condominios = get_user_condominios(self.request.user)
        if condominios is None:
            return qs
        return qs.filter(condominio__in=condominios)

    def perform_create(self, serializer):
        condominios = get_user_condominios(self.request.user)
        condominio = serializer.validated_data.get("condominio")
        # Admin com escopo: a enquete precisa pertencer a um condomínio dele,
        # senão sumiria da própria lista (get_queryset filtra por condominio).
        if condominios is not None:
            if condominio is None:
                perfil = getattr(self.request.user, "perfil_admin", None)
                condominio = perfil.condominios.first() if perfil else None
                if condominio is None:
                    raise PermissionDenied(
                        "Nenhum condomínio associado ao seu usuário."
                    )
                serializer.save(condominio=condominio)
                return
            if condominio.id not in condominios:
                raise PermissionDenied("Condomínio fora do seu escopo.")
        serializer.save()


class ListaPresencaViewSet(viewsets.ModelViewSet):
    serializer_class = ListaPresencaSerializer
    permission_classes = [IsAdminWithRole]

    def get_queryset(self):
        qs = ListaPresenca.objects.all()
        condominios = get_user_condominios(self.request.user)
        if condominios is None:
            return qs
        return qs.filter(condominio__in=condominios)

    def perform_create(self, serializer):
        condominios = get_user_condominios(self.request.user)
        condominio = serializer.validated_data.get("condominio")
        if condominios is not None:
            if condominio is None:
                perfil = getattr(self.request.user, "perfil_admin", None)
                condominio = perfil.condominios.first() if perfil else None
                if condominio is None:
                    raise PermissionDenied(
                        "Nenhum condomínio associado ao seu usuário."
                    )
                serializer.save(condominio=condominio)
                return
            if condominio.id not in condominios:
                raise PermissionDenied("Condomínio fora do seu escopo.")
        serializer.save()

    @action(detail=True, methods=["get"], url_path="registros")
    def registros(self, request, pk=None):
        lista = self.get_object()
        qs = lista.registros.all()
        return Response(PresencaManualSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="60/m", block=True)
def lista_presenca_publica(request, lista_id):
    try:
        lista = ListaPresenca.objects.get(id=lista_id)
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Lista não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {
            "id": str(lista.id),
            "titulo": lista.titulo,
            "ativa": lista.ativa,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="20/m", block=True)
def registrar_presenca_manual(request, lista_id):
    try:
        lista = ListaPresenca.objects.get(id=lista_id)
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Lista não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not lista.ativa:
        return Response(
            {"error": "Esta lista de presença está encerrada."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nome = str(request.data.get("nome", "")).strip()[:200]
    if not nome:
        return Response(
            {"error": "Informe o nome."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    bloco = str(request.data.get("bloco", "")).strip()[:20]
    apartamento = str(request.data.get("apartamento", "")).strip()[:20]
    selfie = str(request.data.get("selfie", ""))
    assinatura = str(request.data.get("assinatura", ""))

    # Guarda contra payloads enormes (data URLs base64). ~3 MB cada.
    if len(selfie) > 3_500_000 or len(assinatura) > 3_500_000:
        return Response(
            {"error": "Imagem muito grande."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not assinatura:
        return Response(
            {"error": "A assinatura é obrigatória."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    PresencaManual.objects.create(
        lista=lista,
        nome=nome,
        bloco=bloco,
        apartamento=apartamento,
        selfie=selfie,
        assinatura=assinatura,
        ip_address=get_client_ip(request),
    )
    return Response({"ok": True}, status=status.HTTP_201_CREATED)


def _resultado_payload(enquete):
    opcoes = list(
        enquete.opcoes.annotate(qtd=Count("votos")).order_by("ordem")
    )
    total = sum(o.qtd for o in opcoes)

    votantes_por_opcao = {}
    if enquete.voto_aberto:
        votos = enquete.votos.order_by("criado_em").values(
            "opcao_id", "votante_nome", "votante_bloco",
            "votante_apartamento", "criado_em",
        )
        for v in votos:
            votantes_por_opcao.setdefault(v["opcao_id"], []).append(
                {
                    "nome": v["votante_nome"],
                    "bloco": v["votante_bloco"],
                    "apartamento": v["votante_apartamento"],
                    "horario": v["criado_em"],
                }
            )

    itens = []
    for o in opcoes:
        item = {
            "id": str(o.id),
            "texto": o.texto,
            "votos": o.qtd,
            "percentual": round(o.qtd * 100 / total, 1) if total else 0,
        }
        if enquete.voto_aberto:
            item["votantes"] = votantes_por_opcao.get(o.id, [])
        itens.append(item)

    # Vencedor só é divulgado após o encerramento, para o parcial não
    # sugerir um resultado que ainda pode mudar.
    vencedor = None
    if total and not enquete.ativa:
        top = max(itens, key=lambda i: i["votos"])
        if top["votos"] > 0:
            vencedor = top
    return {
        "id": str(enquete.id),
        "titulo": enquete.titulo,
        "ativa": enquete.ativa,
        "voto_aberto": enquete.voto_aberto,
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
            "voto_aberto": enquete.voto_aberto,
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

    votante_nome = ""
    votante_bloco = ""
    votante_apartamento = ""
    if enquete.voto_aberto:
        votante_nome = str(request.data.get("votante_nome", "")).strip()[:200]
        votante_bloco = str(request.data.get("votante_bloco", "")).strip()[:20]
        votante_apartamento = str(
            request.data.get("votante_apartamento", "")
        ).strip()[:20]
        if not votante_nome or not votante_apartamento:
            return Response(
                {"error": "Nesta votação você precisa se identificar (nome e apartamento)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        EnqueteVoto.objects.create(
            enquete=enquete,
            opcao=opcao,
            device_id=device_id,
            ip_address=get_client_ip(request),
            votante_nome=votante_nome,
            votante_bloco=votante_bloco,
            votante_apartamento=votante_apartamento,
        )
    except IntegrityError:
        # Corrida: o mesmo dispositivo enviou dois votos quase simultâneos.
        return Response(
            {"error": "Você já votou nesta enquete."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(_resultado_payload(enquete), status=status.HTTP_201_CREATED)

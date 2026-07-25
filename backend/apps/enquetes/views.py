from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import IntegrityError
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.otp import gerar_otp, validar_otp
from core.permissions import (
    IsAdminWithRole,
    get_or_create_user_condominio,
    get_user_condominios,
)
from core.request_info import get_client_user_agent, infer_device_info

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
                condominio = get_or_create_user_condominio(self.request.user)
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
                condominio = get_or_create_user_condominio(self.request.user)
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

    @action(
        detail=True,
        methods=["delete"],
        url_path="registros/(?P<registro_id>[^/.]+)",
    )
    def excluir_registro(self, request, pk=None, registro_id=None):
        lista = self.get_object()
        registro = get_object_or_404(lista.registros, id=registro_id)
        registro.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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

    perfis_validos = {"proprietario", "locatario", "conjuge", "procurador", "outro"}
    perfil = str(request.data.get("perfil", "")).strip().lower()
    if perfil not in perfis_validos:
        perfil = "proprietario"

    bloco = str(request.data.get("bloco", "")).strip()[:20]
    apartamento = str(request.data.get("apartamento", "")).strip()[:20]
    email = str(request.data.get("email", "")).strip().lower()[:254]
    selfie = str(request.data.get("selfie", ""))
    assinatura = str(request.data.get("assinatura", ""))
    assinatura_facial = str(request.data.get("assinatura_facial", "")).strip()[:64]
    marca_aparelho = str(request.data.get("marca_aparelho", "")).strip()[:120]

    # LGPD: consentimento obrigatório para registrar a presença.
    consentimento_lgpd = bool(request.data.get("consentimento_lgpd"))
    declaracao_veracidade = bool(request.data.get("declaracao_veracidade"))
    if not consentimento_lgpd:
        return Response(
            {"error": "É necessário concordar com o uso dos dados (LGPD) para registrar a presença."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Cascata de identificação: facial → digital (webauthn) → código por e-mail (otp).
    metodo_auth = str(request.data.get("metodo_auth", "")).strip().lower()
    if metodo_auth not in {"facial", "webauthn", "otp"}:
        return Response(
            {"error": "É necessário confirmar a identidade (biometria facial, digital ou código por e-mail)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if metodo_auth == "facial" and not assinatura_facial:
        return Response(
            {"error": "Não foi possível capturar a biometria facial. Tente novamente ou escolha outra forma."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if metodo_auth == "otp":
        if not email:
            return Response(
                {"error": "Informe o e-mail para confirmar por código."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ok_key = f"presenca_otp_ok:{lista_id}:{email}"
        if not cache.get(ok_key):
            return Response(
                {"error": "Confirme o código enviado para o seu e-mail antes de registrar a presença."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cache.delete(ok_key)

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

    user_agent = get_client_user_agent(request)
    PresencaManual.objects.create(
        lista=lista,
        nome=nome,
        perfil=perfil,
        bloco=bloco,
        apartamento=apartamento,
        email=email,
        selfie=selfie,
        assinatura=assinatura,
        metodo_auth=metodo_auth,
        assinatura_facial=assinatura_facial,
        marca_aparelho=marca_aparelho or infer_device_info(user_agent),
        user_agent=user_agent,
        device_info=infer_device_info(user_agent),
        consentimento_lgpd=consentimento_lgpd,
        consentimento_em=timezone.now() if consentimento_lgpd else None,
        declaracao_veracidade=declaracao_veracidade,
        ip_address=get_client_ip(request),
    )
    return Response({"ok": True}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="10/m", block=True)
def presenca_enviar_codigo(request, lista_id):
    """Envia um código de confirmação por e-mail (fallback da cascata da lista de presença)."""
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

    email = str(request.data.get("email", "")).strip().lower()[:254]
    if not email or "@" not in email:
        return Response(
            {"error": "Informe um e-mail válido."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = gerar_otp(f"presenca:{lista_id}:{email}")
    send_mail(
        subject="Código de confirmação de presença",
        message=(
            f"Seu código para confirmar presença em \"{lista.titulo}\" é: {code}\n\n"
            "Válido por 10 minutos."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, "DEFAULT_FROM_EMAIL") else None,
        recipient_list=[email],
        fail_silently=False,
    )

    parts = email.split("@")
    masked = parts[0][0] + "***@" + parts[1] if len(parts) == 2 else "***"
    return Response({"sent": True, "email_masked": masked})


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="10/m", block=True)
def presenca_verificar_codigo(request, lista_id):
    """Valida o código de e-mail e libera o registro por até 10 minutos."""
    email = str(request.data.get("email", "")).strip().lower()[:254]
    code = str(request.data.get("codigo", "")).strip()
    if not email or not code:
        return Response(
            {"error": "Informe o e-mail e o código."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not validar_otp(f"presenca:{lista_id}:{email}", code):
        return Response(
            {"error": "Código inválido ou expirado."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    cache.set(f"presenca_otp_ok:{lista_id}:{email}", True, timeout=600)
    return Response({"ok": True})


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

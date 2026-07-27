import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.eleitores.facial import melhor_correspondencia, validar_descriptor
from apps.eleitores.models import Eleitor, IdentidadeFacial
from apps.eleitores.serializers import EleitorSerializer
from core.otp import gerar_otp, validar_otp
from core.permissions import (
    IsAdminWithRole,
    get_or_create_user_condominio,
    get_user_condominios,
    resolver_condominio_por_nome,
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
        # O síndico informa o nome do condomínio ao gerar a lista (obrigatório).
        nome_cond = serializer.validated_data.pop("nome_condominio", "").strip()
        condominio = self._resolver_condominio(self.request.user, nome_cond)
        serializer.save(condominio=condominio)

    def _resolver_condominio(self, user, nome_cond):
        return resolver_condominio_por_nome(user, nome_cond)

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


@api_view(["POST"])
@permission_classes([IsAdminWithRole])
def importar_planilha_completa(request):
    """Um clique a partir da planilha de moradores: cria/reusa o condomínio,
    importa os moradores (com CPF, sem duplicar), atualiza blocos e total de
    unidades, e cria já vinculadas a lista de presença e a votação (rascunho,
    com todos os moradores como votantes). Só falta o síndico digitar as
    perguntas da pauta — a planilha traz pessoas, não o que será votado."""
    from apps.assembleias.models import Assembleia

    nome_cond = str(request.data.get("nome_condominio") or "").strip()
    titulo = str(request.data.get("titulo") or "").strip()
    rows = request.data.get("eleitores") or []
    if not nome_cond or not titulo:
        return Response(
            {"error": "Informe o nome do condomínio e o título da reunião."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not isinstance(rows, list) or not rows:
        return Response(
            {"error": "A planilha está vazia ou não foi lida."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        condominio = resolver_condominio_por_nome(request.user, nome_cond)

        criados = 0
        pulados = 0
        erros = []
        for i, row in enumerate(rows, start=2):  # linha 2 = 1ª linha de dados
            serializer = EleitorSerializer(
                data={**row, "condominio": str(condominio.id)}
            )
            if serializer.is_valid():
                v = serializer.validated_data
                ja_existe = Eleitor.objects.filter(
                    condominio_id=condominio.id,
                    bloco=v.get("bloco", "") or "",
                    apartamento=v.get("apartamento", ""),
                    cpf_hash=v.get("cpf_hash"),
                ).exists()
                if ja_existe:
                    pulados += 1
                    continue
                serializer.save(
                    convite_token=secrets.token_urlsafe(48),
                    convite_expira_em=timezone.now() + timedelta(days=7),
                )
                criados += 1
            else:
                erros.append({"linha": i, "erros": serializer.errors})

        # Blocos e total de unidades deduzidos da planilha (todos do condomínio).
        eleitores_cond = Eleitor.objects.filter(condominio_id=condominio.id)
        blocos = sorted(
            {
                (e.bloco or "").strip()
                for e in eleitores_cond
                if (e.bloco or "").strip()
            }
        )
        total_unidades = (
            eleitores_cond.values("bloco", "apartamento").distinct().count()
        )
        condominio.blocos = blocos
        condominio.total_unidades = total_unidades
        condominio.save(update_fields=["blocos", "total_unidades", "atualizado_em"])

        lista = ListaPresenca.objects.create(condominio=condominio, titulo=titulo)

        agora = timezone.now()
        assembleia = Assembleia.objects.create(
            condominio=condominio,
            titulo=titulo,
            data_inicio=agora,
            data_fim=agora + timedelta(days=1),
        )
        assembleia.votantes.set(
            list(eleitores_cond.values_list("id", flat=True))
        )

    return Response(
        {
            "condominio_id": str(condominio.id),
            "lista_id": str(lista.id),
            "lista_codigo": lista.codigo_curto,
            "assembleia_id": str(assembleia.id),
            "assembleia_codigo": assembleia.codigo_curto,
            "criados": criados,
            "pulados": pulados,
            "erros": erros,
        },
        status=status.HTTP_201_CREATED,
    )


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
    # Só faz sentido pedir o CPF quando este condomínio tem moradores
    # importados (com CPF). Nas demais listas, a tela vai direto para a facial.
    tem_cpf = bool(
        lista.condominio_id
        and Eleitor.objects.filter(condominio_id=lista.condominio_id)
        .exclude(cpf_hash__isnull=True)
        .exclude(cpf_hash="")
        .exists()
    )
    return Response(
        {
            "id": str(lista.id),
            "titulo": lista.titulo,
            "ativa": lista.ativa,
            "tem_cpf": tem_cpf,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="30/m", block=True)
def consultar_cpf_presenca(request, lista_id):
    """Morador digita o CPF na lista de presença; devolve as unidades ligadas a
    esse CPF/CNPJ no condomínio da lista, para preencher nome/bloco/apartamento
    sem digitação. Recebe já o hash (o CPF nunca trafega em texto). Não expõe
    e-mail nem qualquer outro dado do morador."""
    try:
        lista = ListaPresenca.objects.get(id=lista_id)
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Lista não encontrada."},
            status=status.HTTP_404_NOT_FOUND,
        )
    cpf_hash = str(request.data.get("cpf_hash", "")).strip().lower()
    if len(cpf_hash) != 64 or any(c not in "0123456789abcdef" for c in cpf_hash):
        return Response(
            {"error": "CPF inválido."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if lista.condominio_id is None:
        return Response({"unidades": []})
    unidades = list(
        Eleitor.objects.filter(
            condominio_id=lista.condominio_id, cpf_hash=cpf_hash
        )
        .order_by("bloco", "apartamento")
        .values("nome", "bloco", "apartamento", "perfil")
    )
    return Response({"unidades": unidades})


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
@ratelimit(key="ip", rate="30/m", block=True)
def presenca_reconhecer_facial(request, lista_id):
    """Recebe o vetor facial e diz se essa pessoa já tem identidade facial cadastrada
    no condomínio desta lista. Não grava nada — só reconhece."""
    try:
        lista = ListaPresenca.objects.get(id=lista_id)
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Lista não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )

    descriptor = validar_descriptor(request.data.get("descriptor"))
    if descriptor is None:
        return Response(
            {"error": "Não foi possível ler o rosto. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not lista.condominio_id:
        # Sem condomínio não há base permanente onde reconhecer.
        return Response({"encontrado": False})

    # defer("selfie"): a foto-comprovante é base64 pesado e não entra na comparação;
    # sem isso, cada leitura puxaria a selfie de TODOS os moradores do condomínio.
    identidades = IdentidadeFacial.objects.filter(
        condominio_id=lista.condominio_id
    ).defer("selfie")
    ident, _dist = melhor_correspondencia(descriptor, identidades)
    # Só informamos SE o rosto é conhecido — nunca o nome/unidade de quem foi
    # reconhecido (LGPD: quem está com o aparelho não deve ver dados de outra
    # pessoa). Na hora de registrar, o servidor reusa os dados guardados.
    return Response({"encontrado": ident is not None})


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="20/m", block=True)
def registrar_presenca_facial(request, lista_id):
    """Marca a presença pelo rosto. Se o rosto já está cadastrado no condomínio,
    reconhece e usa os dados existentes (não pede cadastro de novo). Se é a
    primeira vez, cadastra a identidade facial permanente (rosto + nome + apto)."""
    try:
        lista = ListaPresenca.objects.get(id=lista_id)
    except ListaPresenca.DoesNotExist:
        return Response(
            {"error": "Lista não encontrada."}, status=status.HTTP_404_NOT_FOUND
        )
    if not lista.ativa:
        return Response(
            {"error": "Esta lista de presença está encerrada."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    descriptor = validar_descriptor(request.data.get("descriptor"))
    if descriptor is None:
        return Response(
            {"error": "Não foi possível ler o rosto. Tente novamente."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    consentimento_lgpd = bool(request.data.get("consentimento_lgpd"))
    if not consentimento_lgpd:
        return Response(
            {"error": "É necessário concordar com o uso dos dados (LGPD) para registrar a presença."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    selfie = str(request.data.get("selfie", ""))
    if len(selfie) > 3_500_000:
        return Response(
            {"error": "Imagem muito grande."}, status=status.HTTP_400_BAD_REQUEST
        )

    assinatura = str(request.data.get("assinatura", ""))
    if len(assinatura) > 2_000_000:
        return Response(
            {"error": "Assinatura muito grande."}, status=status.HTTP_400_BAD_REQUEST
        )

    perfis_validos = {"proprietario", "locatario", "conjuge", "procurador", "outro"}
    agora = timezone.now()

    # Procura se esse rosto já é conhecido no condomínio.
    ident = None
    if lista.condominio_id:
        identidades = IdentidadeFacial.objects.filter(
            condominio_id=lista.condominio_id
        ).defer("selfie")
        ident, _dist = melhor_correspondencia(descriptor, identidades)

    if ident is None:
        # Primeira vez: precisa de nome e apartamento para cadastrar a identidade.
        nome = str(request.data.get("nome", "")).strip()[:200]
        if not nome:
            return Response(
                {"error": "Informe o nome para o primeiro cadastro."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bloco = str(request.data.get("bloco", "")).strip()[:20]
        apartamento = str(request.data.get("apartamento", "")).strip()[:20]
        perfil = str(request.data.get("perfil", "")).strip().lower()
        if perfil not in perfis_validos:
            perfil = "proprietario"
        if lista.condominio_id:
            ident = IdentidadeFacial.objects.create(
                condominio_id=lista.condominio_id,
                nome=nome,
                bloco=bloco,
                apartamento=apartamento,
                perfil=perfil,
                descriptor=descriptor,
                selfie=selfie,
                consentimento_lgpd=True,
                consentimento_em=agora,
            )
        nome_reg, bloco_reg, apto_reg, perfil_reg = nome, bloco, apartamento, perfil
        novo = True
    else:
        # Rosto já conhecido: usa os dados cadastrados.
        nome_reg = ident.nome
        bloco_reg = ident.bloco
        apto_reg = ident.apartamento
        perfil_reg = ident.perfil if ident.perfil in perfis_validos else "proprietario"
        novo = False

    # Evita presença duplicada na mesma lista.
    if ident is not None and PresencaManual.objects.filter(
        lista=lista, identidade=ident
    ).exists():
        return Response(
            {"ok": True, "ja_presente": True, "novo": False, "nome": nome_reg}
        )

    user_agent = get_client_user_agent(request)
    marca_aparelho = str(request.data.get("marca_aparelho", "")).strip()[:120]
    try:
        # Savepoint próprio: se dois cliques/aparelhos gravarem ao mesmo tempo,
        # a constraint única barra o segundo sem derrubar a requisição.
        with transaction.atomic():
            PresencaManual.objects.create(
                lista=lista,
                identidade=ident,
                nome=nome_reg,
                perfil=perfil_reg,
                bloco=bloco_reg,
                apartamento=apto_reg,
                selfie=selfie or (ident.selfie if ident else ""),
                assinatura=assinatura,
                metodo_auth="facial",
                marca_aparelho=marca_aparelho or infer_device_info(user_agent),
                user_agent=user_agent,
                device_info=infer_device_info(user_agent),
                consentimento_lgpd=True,
                consentimento_em=agora,
                declaracao_veracidade=bool(request.data.get("declaracao_veracidade")),
                ip_address=get_client_ip(request),
            )
    except IntegrityError:
        return Response(
            {"ok": True, "ja_presente": True, "novo": False, "nome": nome_reg}
        )

    # Rosto já conhecido: registra que foi visto de novo nesta assembleia.
    if ident is not None and not novo:
        ident.save(update_fields=["ultimo_visto_em"])

    return Response(
        {"ok": True, "ja_presente": False, "novo": novo, "nome": nome_reg},
        status=status.HTTP_201_CREATED,
    )


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

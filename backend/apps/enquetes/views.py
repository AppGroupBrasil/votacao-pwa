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

from apps.eleitores.facial import (
    LIMIAR_BUSCA,
    melhor_correspondencia,
    tem_biometria,
    validar_descriptor,
    validar_lista_descriptors,
    verificar,
)
from apps.eleitores.models import (
    Eleitor,
    IdentidadeFacial,
    MENSAGEM_INADIMPLENTE,
    normalizar_unidade,
    unidade_inadimplente,
)
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
    chave_unidade,
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

    @action(
        detail=True,
        methods=["post"],
        url_path="registros/(?P<registro_id>[^/.]+)/conferir",
    )
    def conferir_registro(self, request, pk=None, registro_id=None):
        """A mesa libera um registro que entrou com selo laranja.

        O morador já consta presente desde que se cadastrou; o selo só marca que
        alguém da mesa precisa olhar (unidade alterada na mão, CPF fora da
        planilha, rosto que não bateu). Enquanto o selo estiver aceso, o voto da
        unidade não é contado — este endpoint é o que apaga o selo.
        """
        lista = self.get_object()
        registro = get_object_or_404(lista.registros, id=registro_id)
        registro.conferir_na_mesa = False
        registro.conferido_em = timezone.now()
        registro.conferido_por = (
            getattr(request.user, "get_full_name", lambda: "")()
            or getattr(request.user, "email", "")
            or str(request.user)
        )[:200]
        registro.save(
            update_fields=["conferir_na_mesa", "conferido_em", "conferido_por"]
        )
        return Response(PresencaManualSerializer(registro).data)


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
    inadimplentes = request.data.get("inadimplentes") or []
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

        # Lista de inadimplentes: marca as unidades correspondentes. É o canal
        # que informa quem não pode votar — o bloqueio no voto já existe, aqui
        # dizemos QUEM. Casa por bloco+apartamento tolerando formatação.
        inad_marcados = 0
        if isinstance(inadimplentes, list) and inadimplentes:
            alvo = set()
            for r in inadimplentes:
                if not isinstance(r, dict):
                    continue
                na = normalizar_unidade(r.get("apartamento"))
                if na:
                    alvo.add((normalizar_unidade(r.get("bloco")), na))
            if alvo:
                for e in eleitores_cond:
                    chave = (normalizar_unidade(e.bloco), normalizar_unidade(e.apartamento))
                    if chave in alvo and not e.inadimplente:
                        e.inadimplente = True
                        e.save(update_fields=["inadimplente", "atualizado_em"])
                        inad_marcados += 1

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
            "inadimplentes_marcados": inad_marcados,
            "erros": erros,
        },
        status=status.HTTP_201_CREATED,
    )


# O que o morador lê quando a presença entra marcada para a mesa conferir.
# Nenhum destes casos impede a presença — todos explicam o motivo em português,
# sem jargão e sem dar a entender que o morador fez algo errado.
AVISOS_CONFERENCIA = {
    "unidade_alterada": (
        "Presença registrada. Como a unidade que você informou está diferente da "
        "planilha da administradora, a mesa vai conferir a alteração antes da "
        "votação. Você não precisa fazer mais nada agora."
    ),
    "rosto_nao_confere": (
        "Presença registrada pela sua foto. Não deu para confirmar pelo rosto — a "
        "foto que você acabou de tirar fica como comprovante e a mesa confere no "
        "fechamento da lista."
    ),
    "sem_cadastro": (
        "Presença registrada. Seu CPF não consta na planilha de moradores enviada "
        "pela administradora, então a mesa vai conferir. Procure a administração do "
        "seu condomínio para atualizar seu cadastro."
    ),
    "rosto_ambiguo": (
        "Presença registrada pela sua foto. O sistema não teve certeza de quem era "
        "e preferiu não registrar um nome errado — a mesa confere no fechamento."
    ),
    "sem_cpf": (
        "Presença registrada. Como você entrou sem informar o CPF, a mesa confere "
        "seus dados no fechamento da lista. Você não precisa fazer mais nada agora."
    ),
}


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
            # Só o aviso de que existe sala; o endereço da sala nunca sai daqui
            # — ele é entregue apenas na resposta do registro de presença.
            "tem_sala": bool(lista.link_reuniao),
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
# Todo mundo chega junto pelo mesmo Wi-Fi do salão (um IP só).
@ratelimit(key="ip", rate="120/m", block=True)
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
        return Response({"unidades": [], "encontrado": False, "tem_rosto": False})
    unidades = list(
        Eleitor.objects.filter(
            condominio_id=lista.condominio_id, cpf_hash=cpf_hash
        )
        .order_by("bloco", "apartamento")
        .values("nome", "bloco", "apartamento", "perfil")
    )
    # Se este CPF já tem rosto guardado, a próxima etapa é só CONFIRMAR que é a
    # mesma pessoa (comparação um-contra-um). Se não tem, a foto de agora vira o
    # cadastro dele. O front usa isto para escolher o texto da tela.
    tem_rosto = IdentidadeFacial.objects.filter(
        condominio_id=lista.condominio_id, cpf_hash=cpf_hash
    ).exists()
    return Response(
        {
            "unidades": unidades,
            "encontrado": bool(unidades),
            "tem_rosto": tem_rosto,
            "mensagem": ""
            if unidades
            else (
                "Seu CPF não consta na planilha de moradores. Verifique junto à "
                "administração do seu condomínio ou sua administradora, porque seu "
                "nome não consta na relação. Você pode registrar sua presença "
                "preenchendo os dados abaixo — a mesa confere depois."
            ),
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
# 120/m: numa assembleia presencial todos entram pelo mesmo Wi-Fi e saem com o
# mesmo IP — é o limite já usado nos endpoints de votação.
@ratelimit(key="ip", rate="120/m", block=True)
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
    if metodo_auth not in {"selfie", "facial", "webauthn", "otp"}:
        return Response(
            {"error": "É necessário confirmar a identidade (selfie, biometria facial, digital ou código por e-mail)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if metodo_auth == "selfie" and not selfie:
        return Response(
            {"error": "A selfie é obrigatória."},
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
    # Caminho simples: sem CPF e sem leitura de rosto. Se o condomínio tem a
    # planilha com CPF, este registro pulou toda a conferência — entra, mas com
    # selo laranja para a mesa olhar no fechamento da lista.
    sem_conferencia = bool(
        lista.condominio_id
        and Eleitor.objects.filter(condominio_id=lista.condominio_id)
        .exclude(cpf_hash__isnull=True)
        .exclude(cpf_hash="")
        .exists()
    )
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
        conferir_na_mesa=sem_conferencia,
        motivo_conferencia="sem_cpf" if sem_conferencia else "",
        assinatura_facial=assinatura_facial,
        marca_aparelho=marca_aparelho or infer_device_info(user_agent),
        user_agent=user_agent,
        device_info=infer_device_info(user_agent),
        consentimento_lgpd=consentimento_lgpd,
        consentimento_em=timezone.now() if consentimento_lgpd else None,
        declaracao_veracidade=declaracao_veracidade,
        ip_address=get_client_ip(request),
    )
    # Presença é sempre permitida (o inadimplente pode participar e assistir);
    # só avisamos, na hora do cadastro, que ele não conseguirá votar.
    inadimplente = unidade_inadimplente(lista.condominio_id, bloco, apartamento)
    return Response(
        {
            "ok": True,
            "inadimplente": inadimplente,
            "aviso": MENSAGEM_INADIMPLENTE if inadimplente else "",
            "conferir_na_mesa": sem_conferencia,
            "aviso_conferencia": (
                AVISOS_CONFERENCIA["sem_cpf"] if sem_conferencia else ""
            ),
            # Presença registrada: agora sim o morador recebe a sala da assembleia.
            "link_reuniao": lista.link_reuniao,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="120/m", block=True)
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
    ident, _dist = melhor_correspondencia(descriptor, identidades, LIMIAR_BUSCA)
    # Só informamos SE o rosto é conhecido — nunca o nome/unidade de quem foi
    # reconhecido (LGPD: quem está com o aparelho não deve ver dados de outra
    # pessoa). Na hora de registrar, o servidor reusa os dados guardados.
    return Response({"encontrado": ident is not None})


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="120/m", block=True)
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

    # O rosto deixou de ser obrigatório. Quando a câmera não consegue ler, a
    # presença é registrada do mesmo jeito pela foto e vai marcada para a mesa
    # conferir — ninguém fica de fora da assembleia por causa da câmera.
    descriptor = validar_descriptor(request.data.get("descriptor"))
    leituras = validar_lista_descriptors(request.data.get("descriptors"))
    if descriptor is not None:
        if descriptor not in leituras:
            leituras = [descriptor, *leituras][:5]
    elif leituras:
        descriptor = leituras[0]

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

    cpf_hash = str(request.data.get("cpf_hash", "")).strip().lower()
    if len(cpf_hash) != 64 or any(c not in "0123456789abcdef" for c in cpf_hash):
        cpf_hash = ""

    # O que o morador confirmou (ou corrigiu) na tela.
    nome_dig = str(request.data.get("nome", "")).strip()[:200]
    bloco_dig = str(request.data.get("bloco", "")).strip()[:20]
    apto_dig = str(request.data.get("apartamento", "")).strip()[:20]
    perfil_dig = str(request.data.get("perfil", "")).strip().lower()
    if perfil_dig not in perfis_validos:
        perfil_dig = "proprietario"

    ident = None
    novo = False
    conferir = False
    motivo = ""
    dist_medida = None
    unidade_original = ""

    if lista.condominio_id and cpf_hash:
        # ---- Caminho normal: o CPF diz quem é a pessoa, o rosto só confirma. ----
        # É esta inversão que acaba com a troca de nomes: não há mais escolha
        # entre centenas de rostos parecidos, só uma pergunta de sim ou não.
        ident = (
            IdentidadeFacial.objects.filter(
                condominio_id=lista.condominio_id, cpf_hash=cpf_hash
            )
            .order_by("criado_em")
            .first()
        )
        unidades_planilha = list(
            Eleitor.objects.filter(
                condominio_id=lista.condominio_id, cpf_hash=cpf_hash
            ).values("nome", "bloco", "apartamento")
        )

        if not nome_dig:
            return Response(
                {"error": "Informe o nome."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not unidades_planilha:
            # CPF fora da relação da administradora: registra assim mesmo e
            # deixa visível para a mesa, em vez de barrar quem é morador de fato.
            conferir, motivo = True, "sem_cadastro"
        else:
            # Trocou de unidade em relação à planilha? A unidade é o único dado
            # que decide direito a voto — então entra, mas passa pela mesa.
            alvo = (normalizar_unidade(bloco_dig), normalizar_unidade(apto_dig))
            casou = any(
                (normalizar_unidade(u["bloco"]), normalizar_unidade(u["apartamento"]))
                == alvo
                for u in unidades_planilha
            )
            if not casou:
                conferir, motivo = True, "unidade_alterada"
                u0 = unidades_planilha[0]
                unidade_original = (
                    f"{u0['bloco']} {u0['apartamento']}".strip()[:60]
                )

        if descriptor is None and not conferir:
            # A câmera não leu o rosto e a pessoa entrou pela selfie: a foto
            # vale como comprovante e a mesa confere. Vale também no primeiro
            # cadastro — antes, quem ainda não tinha rosto guardado entrava sem
            # nenhuma conferência.
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
            ident.nome = nome_dig or ident.nome
            ident.bloco = bloco_dig or ident.bloco
            ident.apartamento = apto_dig or ident.apartamento
            ident.perfil = perfil_dig
            ident.save()
        else:
            # Primeira assembleia deste CPF: a foto de agora vira o cadastro.
            # Guardar rosto é dado sensível — sem o aceite explícito, não grava.
            if not bool(request.data.get("consentimento_lgpd")):
                return Response(
                    {"error": "É necessário concordar com o uso dos dados (LGPD)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ident = IdentidadeFacial(
                condominio_id=lista.condominio_id,
                cpf_hash=cpf_hash,
                nome=nome_dig,
                bloco=bloco_dig,
                apartamento=apto_dig,
                perfil=perfil_dig,
                descriptor=descriptor or [],
                selfie=selfie,
                consentimento_lgpd=True,
                consentimento_em=agora,
            )
            for v in leituras:
                ident.guardar_leitura(v)
            ident.save()
            novo = True

        nome_reg, bloco_reg, apto_reg, perfil_reg = (
            nome_dig,
            bloco_dig,
            apto_dig,
            perfil_dig,
        )
    else:
        # ---- Sem CPF na base do condomínio: só aqui ainda procuramos o rosto
        # entre todos. Agora com limiar rígido e recusa em caso de empate — se
        # duas pessoas ficam parecidas, o sistema não escolhe, marca para a mesa.
        # Se o condomínio TEM planilha com CPF, quem chegou aqui usou o botão
        # "não tenho o CPF em mãos" e pulou a conferência que evita a troca de
        # nomes. A presença entra do mesmo jeito, com selo laranja para a mesa.
        if (
            lista.condominio_id
            and Eleitor.objects.filter(condominio_id=lista.condominio_id)
            .exclude(cpf_hash__isnull=True)
            .exclude(cpf_hash="")
            .exists()
        ):
            conferir, motivo = True, "sem_cpf"
        if descriptor is not None and lista.condominio_id:
            identidades = IdentidadeFacial.objects.filter(
                condominio_id=lista.condominio_id
            ).defer("selfie")
            ident, d = melhor_correspondencia(descriptor, identidades, LIMIAR_BUSCA)
            dist_medida = None if d == float("inf") else round(d, 4)
            if ident is None and d < LIMIAR_BUSCA + 0.1:
                # Chegou perto de alguém mas sem certeza: não chuta.
                conferir, motivo = True, "rosto_ambiguo"

        if ident is None:
            if not nome_dig:
                return Response(
                    {"error": "Informe o nome para o primeiro cadastro."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if lista.condominio_id:
                # Duplo clique/duas abas: se já existe identidade da mesma pessoa
                # na mesma unidade, reaproveita em vez de criar uma segunda.
                ident = (
                    IdentidadeFacial.objects.filter(
                        condominio_id=lista.condominio_id,
                        nome__iexact=nome_dig,
                        bloco__iexact=bloco_dig,
                        apartamento__iexact=apto_dig,
                    )
                    .order_by("id")
                    .first()
                )
                if ident is None:
                    ident = IdentidadeFacial(
                        condominio_id=lista.condominio_id,
                        nome=nome_dig,
                        bloco=bloco_dig,
                        apartamento=apto_dig,
                        perfil=perfil_dig,
                        descriptor=descriptor or [],
                        selfie=selfie,
                        consentimento_lgpd=True,
                        consentimento_em=agora,
                    )
                    for v in leituras:
                        ident.guardar_leitura(v)
                    ident.save()
            nome_reg, bloco_reg, apto_reg, perfil_reg = (
                nome_dig,
                bloco_dig,
                apto_dig,
                perfil_dig,
            )
            novo = True
        else:
            # Rosto reconhecido com folga: vale o que o morador digitou agora
            # (pode ter corrigido); o cadastro antigo preenche o que veio vazio.
            nome_reg = nome_dig or ident.nome
            bloco_reg = bloco_dig or ident.bloco
            apto_reg = apto_dig or ident.apartamento
            perfil_reg = perfil_dig
            if descriptor is not None:
                ident.guardar_leitura(descriptor)
                ident.save(update_fields=["descriptors"])

    # Evita presença duplicada na mesma lista.
    if ident is not None:
        ja = PresencaManual.objects.filter(lista=lista, identidade=ident).first()
        if ja is not None:
            if (
                conferir
                and not ja.conferir_na_mesa
                and ja.conferido_em is None
            ):
                # Entrou limpo antes, mas a tentativa de agora não confere: acende
                # o selo para a mesa olhar, em vez de deixar a segunda entrada
                # passar em silêncio por já haver alguém na lista com este CPF.
                ja.conferir_na_mesa = True
                ja.motivo_conferencia = motivo
                ja.unidade_original = unidade_original or ja.unidade_original
                ja.save(
                    update_fields=[
                        "conferir_na_mesa",
                        "motivo_conferencia",
                        "unidade_original",
                    ]
                )
            # Devolve o nome de quem já consta na lista: se o rosto foi confundido
            # com outra pessoa, o morador vê o nome errado e procura a mesa.
            return Response(
                {
                    "ok": True,
                    "ja_presente": True,
                    "novo": False,
                    "nome": ja.nome,
                    "bloco": ja.bloco,
                    "apartamento": ja.apartamento,
                    # Já consta na lista: continua tendo direito à sala.
                    "link_reuniao": lista.link_reuniao,
                }
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
                # Só chamamos de biometria quando o rosto realmente conferiu.
                # Registro por foto não pode ser rotulado de facial na ata.
                metodo_auth=(
                    "cpf_facial"
                    if (cpf_hash and descriptor is not None and motivo != "rosto_nao_confere")
                    else "cpf"
                    if cpf_hash
                    else "facial"
                    if (ident is not None and descriptor is not None and not conferir)
                    else "selfie"
                ),
                conferir_na_mesa=conferir,
                motivo_conferencia=motivo,
                distancia_facial=dist_medida,
                unidade_original=unidade_original,
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
            {
                "ok": True,
                "ja_presente": True,
                "novo": False,
                "nome": nome_reg,
                # Já estava presente: continua tendo direito à sala.
                "link_reuniao": lista.link_reuniao,
            }
        )

    # Rosto já conhecido: registra que foi visto de novo nesta assembleia.
    if ident is not None and not novo:
        ident.save(update_fields=["ultimo_visto_em"])

    # Mesmo aviso do cadastro simples: inadimplente participa, mas não vota.
    inadimplente = unidade_inadimplente(lista.condominio_id, bloco_reg, apto_reg)
    return Response(
        {
            "ok": True,
            "ja_presente": False,
            "novo": novo,
            "nome": nome_reg,
            "inadimplente": inadimplente,
            "aviso": MENSAGEM_INADIMPLENTE if inadimplente else "",
            "conferir_na_mesa": conferir,
            "motivo_conferencia": motivo,
            "aviso_conferencia": AVISOS_CONFERENCIA.get(motivo, "") if conferir else "",
            "link_reuniao": lista.link_reuniao,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
# Mais folgado que o padrão porque a sala inteira sai do mesmo IP, mas ainda
# com freio: cada envio é um e-mail de verdade.
@ratelimit(key="ip", rate="30/m", block=True)
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
@ratelimit(key="ip", rate="30/m", block=True)
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
            "exige_identificacao": enquete.exige_identificacao,
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

    exige = enquete.exige_identificacao
    votante_nome = ""
    votante_bloco = ""
    votante_apartamento = ""
    selfie = ""
    assinatura = ""
    consentimento_lgpd = False
    declaracao_veracidade = False
    marca_aparelho = ""
    user_agent = ""
    geo_lat = None
    geo_lng = None

    if enquete.voto_aberto or exige:
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

    unidade = chave_unidade(votante_bloco, votante_apartamento)

    if enquete.exige_presenca:
        lista = enquete.lista_presenca
        if lista is None:
            return Response(
                {
                    "error": (
                        "Esta votação exige presença, mas nenhuma lista de presença "
                        "foi ligada a ela. Avise a mesa."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        if not unidade:
            return Response(
                {"error": "Informe o bloco e o apartamento para votar."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Registro com selo laranja (unidade alterada na mão, CPF fora da
        # planilha, rosto que não confirmou) conta como presente na lista, mas
        # não libera o voto: a mesa precisa conferir o documento primeiro. Basta
        # UM registro liberado na unidade para ela poder votar.
        presentes = set()
        aguardando_mesa = set()
        for b, a, conferir in PresencaManual.objects.filter(lista=lista).values_list(
            "bloco", "apartamento", "conferir_na_mesa"
        ):
            chave = chave_unidade(b, a)
            (aguardando_mesa if conferir else presentes).add(chave)
        if unidade not in presentes:
            if unidade in aguardando_mesa:
                return Response(
                    {
                        "error": (
                            "Sua presença está registrada, mas aguarda conferência "
                            "da mesa. Procure a mesa com um documento para liberar "
                            "o voto da sua unidade."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {
                    "error": (
                        "Esta unidade não está na lista de presença. Registre a "
                        "presença antes de votar ou procure a mesa."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    if (
        enquete.um_voto_por_unidade
        and unidade
        and EnqueteVoto.objects.filter(enquete=enquete, unidade_chave=unidade).exists()
    ):
        return Response(
            {"error": "Esta unidade já votou nesta votação."},
            status=status.HTTP_409_CONFLICT,
        )

    if exige:
        selfie = str(request.data.get("selfie", ""))
        assinatura = str(request.data.get("assinatura", ""))
        if len(selfie) > 3_500_000 or len(assinatura) > 3_500_000:
            return Response(
                {"error": "Imagem muito grande."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not selfie:
            return Response(
                {"error": "A selfie (foto) é obrigatória nesta votação."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not assinatura:
            return Response(
                {"error": "A assinatura é obrigatória nesta votação."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        consentimento_lgpd = bool(request.data.get("consentimento_lgpd"))
        if not consentimento_lgpd:
            return Response(
                {"error": "É necessário concordar com o uso dos dados (LGPD) para votar."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        declaracao_veracidade = bool(request.data.get("declaracao_veracidade"))
        marca_aparelho = str(request.data.get("marca_aparelho", "")).strip()[:120]
        try:
            geo_lat = float(request.data.get("geo_lat"))
        except (TypeError, ValueError):
            geo_lat = None
        try:
            geo_lng = float(request.data.get("geo_lng"))
        except (TypeError, ValueError):
            geo_lng = None
        user_agent = get_client_user_agent(request)

    try:
        EnqueteVoto.objects.create(
            enquete=enquete,
            opcao=opcao,
            device_id=device_id,
            unidade_chave=unidade if enquete.um_voto_por_unidade else "",
            ip_address=get_client_ip(request),
            votante_nome=votante_nome,
            votante_bloco=votante_bloco,
            votante_apartamento=votante_apartamento,
            votante_selfie=selfie,
            votante_assinatura=assinatura,
            consentimento_lgpd=consentimento_lgpd,
            consentimento_em=timezone.now() if consentimento_lgpd else None,
            declaracao_veracidade=declaracao_veracidade,
            marca_aparelho=marca_aparelho,
            user_agent=user_agent,
            geo_lat=geo_lat,
            geo_lng=geo_lng,
        )
    except IntegrityError:
        # Corrida: dois votos quase simultâneos do mesmo aparelho ou da mesma unidade.
        return Response(
            {"error": "Já existe um voto registrado para você ou para esta unidade."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(_resultado_payload(enquete), status=status.HTTP_201_CREATED)

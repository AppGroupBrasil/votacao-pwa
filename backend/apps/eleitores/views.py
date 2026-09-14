import secrets
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_ratelimit.decorators import ratelimit
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.assembleias.regras import cadastro_fechado, regra_cadastro
from apps.condominios.models import Condominio
from core.otp import gerar_otp, validar_otp
from core.permissions import IsAdminWithRole, IsMaster, get_user_condominios
from core.request_info import get_client_user_agent

from .facial import (
    MAX_TEMPLATES,
    MINIMO_LEITURAS_CADASTRO,
    cadastro_sem_cpf_do_rosto,
    leituras_consistentes,
    marcar_se_duplicado,
    salvar_identidade_nova,
    tem_biometria,
    validar_lista_descriptors,
    verificar,
)
from .models import Eleitor, IdentidadeFacial, SolicitacaoExclusao
from .serializers import (
    EleitorOnboardingSerializer,
    EleitorSerializer,
    SolicitacaoExclusaoSerializer,
)


def _get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# --- Cadastro antecipado do rosto -------------------------------------------
# O morador cadastra o rosto pelo link do condomínio dias antes. No dia da
# assembleia sobra só a confirmação um-contra-um: sem aceite de LGPD, sem
# conferir dados, sem baixar de novo os modelos da câmera (ficam no aparelho).
# Quem não está na planilha (procurador, locatário) também se cadastra, com a
# unidade que representa: a administração confere a lista antes do dia e, na
# entrada, o registro sai com selo para a mesa.

CPF_FORA_DA_PLANILHA_CADASTRO = (
    "Seu CPF não está na planilha de moradores. Se você representa uma unidade "
    "(procuração, locação), informe os dados abaixo: a administração confere "
    "antes da assembleia."
)

# Condomínio cuja planilha veio sem CPF (em produção, o maior deles): ninguém
# está "fora da planilha" — todo mundo informa a própria unidade.
SEM_PLANILHA_CADASTRO = "Informe seu nome e a sua unidade."

PERFIS_VALIDOS = {"proprietario", "locatario", "conjuge", "procurador", "outro"}


def _cpf_hash_da_requisicao(request):
    cpf_hash = str(request.data.get("cpf_hash", "")).strip().lower()
    if len(cpf_hash) != 64 or any(c not in "0123456789abcdef" for c in cpf_hash):
        return ""
    return cpf_hash


def _tem_planilha_com_cpf(condominio_id):
    return (
        Eleitor.objects.filter(condominio_id=condominio_id)
        .exclude(cpf_hash__isnull=True)
        .exclude(cpf_hash="")
        .exists()
    )


# O limite vem por fora do @api_view (como na votação): de dentro, o DRF
# transforma o estouro num 403 genérico e o morador não lê o "aguarde".
@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def cadastro_facial_info(request, condominio_id):
    condominio = get_object_or_404(Condominio, id=condominio_id)
    regra = regra_cadastro(condominio.id)
    return Response(
        {
            "condominio_nome": condominio.nome,
            "regra": regra.como_dict() if regra else None,
            "tem_planilha": _tem_planilha_com_cpf(condominio.id),
        }
    )


@ratelimit(key="ip", rate="120/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def cadastro_facial_consultar_cpf(request, condominio_id):
    """Mostra a quem pertence o CPF (nome e unidade da planilha) para o morador
    confirmar que é ele antes de a foto virar o documento. Recebe só o hash."""
    condominio = get_object_or_404(Condominio, id=condominio_id)
    cpf_hash = _cpf_hash_da_requisicao(request)
    if not cpf_hash:
        return Response({"error": "CPF inválido."}, status=status.HTTP_400_BAD_REQUEST)
    unidades = list(
        Eleitor.objects.filter(condominio=condominio, cpf_hash=cpf_hash)
        .order_by("bloco", "apartamento")
        .values("nome", "bloco", "apartamento")
    )
    ident = (
        IdentidadeFacial.objects.filter(condominio=condominio, cpf_hash=cpf_hash)
        .only("descriptor", "descriptors")
        .first()
    )
    tem_planilha = bool(unidades) or _tem_planilha_com_cpf(condominio.id)
    return Response(
        {
            "unidades": unidades,
            "encontrado": bool(unidades),
            "tem_rosto": bool(ident and tem_biometria(ident)),
            "tem_planilha": tem_planilha,
            "mensagem": ""
            if unidades
            else (CPF_FORA_DA_PLANILHA_CADASTRO if tem_planilha else SEM_PLANILHA_CADASTRO),
        }
    )


# 60/m: um mutirão de cadastro na portaria sai todo pelo mesmo Wi-Fi.
@ratelimit(key="ip", rate="60/m", block=True)
@api_view(["POST"])
@permission_classes([AllowAny])
def cadastro_facial_salvar(request, condominio_id):
    """Grava o rosto do morador antes da assembleia.

    Mais exigente que o cadastro feito na porta, porque aqui não há pressa:
    várias leituras que precisam concordar entre si, e um CPF que já tem rosto
    só troca de rosto se a foto nova confirmar o cadastro atual — senão qualquer
    um com o CPF alheio sobrescreveria o documento do vizinho."""
    condominio = get_object_or_404(Condominio, id=condominio_id)
    fechado = cadastro_fechado(condominio.id)
    if fechado:
        return Response(
            {"error": fechado.mensagem_fechado, "cadastro_fechado": True},
            status=status.HTTP_403_FORBIDDEN,
        )
    cpf_hash = _cpf_hash_da_requisicao(request)
    if not cpf_hash:
        return Response({"error": "CPF inválido."}, status=status.HTTP_400_BAD_REQUEST)
    if not bool(request.data.get("consentimento_lgpd")):
        return Response(
            {"error": "É necessário concordar com o uso dos dados (LGPD)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    unidade = (
        Eleitor.objects.filter(condominio=condominio, cpf_hash=cpf_hash)
        .order_by("bloco", "apartamento")
        .first()
    )
    if unidade is not None:
        dados = {
            "nome": unidade.nome,
            "bloco": unidade.bloco or "",
            "apartamento": unidade.apartamento or "",
            "perfil": unidade.perfil or "proprietario",
        }
    else:
        # Fora da planilha: vale o que a pessoa declarou. É justamente o
        # cadastro que a administração vai conferir antes do dia.
        perfil = str(request.data.get("perfil", "")).strip().lower()
        if perfil not in PERFIS_VALIDOS:
            perfil = "procurador" if _tem_planilha_com_cpf(condominio.id) else "proprietario"
        dados = {
            "nome": str(request.data.get("nome", "")).strip()[:200],
            "bloco": str(request.data.get("bloco", "")).strip()[:20],
            "apartamento": str(request.data.get("apartamento", "")).strip()[:20],
            "perfil": perfil,
        }
        if not dados["nome"] or not dados["apartamento"]:
            return Response(
                {"error": "Informe seu nome e a unidade que você representa."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    selfie = str(request.data.get("selfie", ""))
    if len(selfie) > 3_500_000:
        return Response(
            {"error": "Imagem muito grande."}, status=status.HTTP_400_BAD_REQUEST
        )
    if not selfie.startswith("data:image/"):
        return Response(
            {"error": "Tire a foto para concluir o cadastro."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    leituras = leituras_consistentes(
        validar_lista_descriptors(request.data.get("descriptors"), maximo=MAX_TEMPLATES * 2)
    )
    if len(leituras) < MINIMO_LEITURAS_CADASTRO:
        return Response(
            {
                "error": (
                    "A leitura do rosto oscilou. Fique parado, com o rosto de "
                    "frente e bem iluminado, e tente de novo."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    leituras = leituras[:MAX_TEMPLATES]

    agora = timezone.now()
    ident = (
        IdentidadeFacial.objects.filter(condominio=condominio, cpf_hash=cpf_hash)
        .order_by("criado_em")
        .first()
    )
    if ident is None:
        antigo = cadastro_sem_cpf_do_rosto(condominio.id, leituras)
        if antigo is not None:
            # Já tinha rosto guardado de antes do CPF: o mesmo cadastro ganha o
            # CPF e as leituras novas, em vez de nascer um segundo.
            for campo, valor in dados.items():
                setattr(antigo, campo, valor)
            antigo.cpf_hash = cpf_hash
            antigo.descriptor = leituras[0]
            antigo.descriptors = list(leituras)
            antigo.selfie = selfie
            antigo.consentimento_lgpd = True
            antigo.consentimento_em = agora
            antigo.cadastro_antecipado_em = agora
            marcar_se_duplicado(antigo, leituras)
            antigo.save()
            return Response({"ok": True, "novo": False, "nome": antigo.nome})

        ident = IdentidadeFacial(
            condominio=condominio,
            cpf_hash=cpf_hash,
            **dados,
            descriptor=leituras[0],
            selfie=selfie,
            consentimento_lgpd=True,
            consentimento_em=agora,
            cadastro_antecipado_em=agora,
        )
        ident, novo = salvar_identidade_nova(ident, leituras)
        if novo and marcar_se_duplicado(ident, leituras):
            ident.save(update_fields=["suspeita_duplicidade"])
        return Response(
            {"ok": True, "novo": novo, "nome": ident.nome},
            status=status.HTTP_201_CREATED if novo else status.HTTP_200_OK,
        )

    if tem_biometria(ident) and not any(verificar(v, ident)[0] for v in leituras):
        return Response(
            {
                "error": (
                    "Este CPF já tem um rosto cadastrado e a foto de agora não "
                    "confere com ele. Se o cadastro não é seu, procure a "
                    "administração do condomínio. No dia da assembleia você "
                    "entra normalmente e a mesa confere o documento."
                )
            },
            status=status.HTTP_409_CONFLICT,
        )

    # Mesma pessoa (ou cadastro antigo só com selfie): as leituras de agora,
    # feitas com calma, substituem as da porta.
    ident.descriptor = leituras[0]
    ident.descriptors = list(leituras)
    ident.selfie = selfie
    ident.consentimento_lgpd = True
    ident.consentimento_em = agora
    ident.cadastro_antecipado_em = agora
    marcar_se_duplicado(ident, leituras)
    ident.save()
    return Response({"ok": True, "novo": False, "nome": ident.nome})


@api_view(["POST"])
@permission_classes([AllowAny])
@ratelimit(key="ip", rate="8/h", block=True)
def criar_solicitacao_exclusao(request):
    """Endpoint público (/excluir): registra um pedido de exclusão de cadastro."""
    nome = str(request.data.get("nome") or "").strip()
    cpf = "".join(ch for ch in str(request.data.get("cpf") or "") if ch.isdigit())
    email = str(request.data.get("email") or "").strip().lower()
    condominio = str(request.data.get("condominio") or "").strip()
    motivo = str(request.data.get("motivo") or "").strip()

    if not nome:
        return Response(
            {"error": "Informe seu nome."}, status=status.HTTP_400_BAD_REQUEST
        )
    if not cpf and not email:
        return Response(
            {"error": "Informe o CPF ou o e-mail para localizarmos seu cadastro."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    SolicitacaoExclusao.objects.create(
        nome=nome[:200],
        cpf=cpf[:20],
        email=email[:200],
        condominio=condominio[:200],
        motivo=motivo,
        ip_address=_get_client_ip(request),
        user_agent=get_client_user_agent(request),
    )
    return Response(
        {"message": "Pedido registrado."}, status=status.HTTP_201_CREATED
    )


class SolicitacaoExclusaoViewSet(viewsets.ModelViewSet):
    """Painel admin: lista e atualiza o status dos pedidos de exclusão."""

    serializer_class = SolicitacaoExclusaoSerializer
    permission_classes = [IsMaster]
    http_method_names = ["get", "patch", "delete", "head", "options"]
    queryset = SolicitacaoExclusao.objects.all()

    def perform_update(self, serializer):
        obj = serializer.save()
        if obj.status in ("concluida", "recusada") and obj.processada_em is None:
            obj.processada_em = timezone.now()
            obj.save(update_fields=["processada_em"])
        elif obj.status == "pendente" and obj.processada_em is not None:
            obj.processada_em = None
            obj.save(update_fields=["processada_em"])


class EleitorViewSet(viewsets.ModelViewSet):
    serializer_class = EleitorSerializer
    permission_classes = [IsAdminWithRole]
    search_fields = ["nome", "apartamento", "email"]
    filterset_fields = ["condominio", "cadastro_completo"]

    def get_queryset(self):
        qs = Eleitor.objects.select_related("condominio").all()
        cond_ids = get_user_condominios(self.request.user)
        if cond_ids is not None:
            qs = qs.filter(condominio_id__in=cond_ids)
        return qs

    def perform_create(self, serializer):
        token = secrets.token_urlsafe(48)
        serializer.save(
            convite_token=token,
            convite_expira_em=timezone.now() + timedelta(days=7),
        )

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_create(self, request):
        condominio_id = request.data.get("condominio")
        rows = request.data.get("eleitores") or []
        if not condominio_id:
            return Response(
                {"error": "Condomínio é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cond_ids = get_user_condominios(request.user)
        if cond_ids is not None and str(condominio_id) not in {str(c) for c in cond_ids}:
            return Response(
                {"error": "Sem acesso a este condomínio."},
                status=status.HTTP_403_FORBIDDEN,
            )

        criados = 0
        pulados = 0
        erros = []
        for i, row in enumerate(rows, start=2):  # linha 2 = primeira linha de dados
            serializer = EleitorSerializer(data={**row, "condominio": condominio_id})
            if serializer.is_valid():
                v = serializer.validated_data
                # Evita duplicar em re-importação: a mesma unidade
                # (condomínio + bloco + apartamento) com o mesmo CPF já cadastrado
                # é ignorada. Como o CPF deixou de ser único, sem isto reimportar
                # a planilha criaria tudo de novo.
                ja_existe = Eleitor.objects.filter(
                    condominio_id=condominio_id,
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

        return Response({"criados": criados, "pulados": pulados, "erros": erros})

    @action(detail=True, methods=["post"], url_path="bloqueio")
    def set_bloqueio(self, request, pk=None):
        eleitor = self.get_object()
        eleitor.bloqueado = bool(request.data.get("bloqueado", not eleitor.bloqueado))
        eleitor.save(update_fields=["bloqueado"])
        return Response({"bloqueado": eleitor.bloqueado})

    @action(detail=True, methods=["post"], url_path="inadimplencia")
    def set_inadimplencia(self, request, pk=None):
        eleitor = self.get_object()
        valor = bool(request.data.get("inadimplente", not eleitor.inadimplente))
        # Inadimplência é por unidade: aplica a todos os moradores da mesma
        # unidade (condomínio + bloco + apartamento).
        afetados = self.get_queryset().filter(
            condominio_id=eleitor.condominio_id,
            bloco=eleitor.bloco,
            apartamento=eleitor.apartamento,
        )
        afetados.update(inadimplente=valor)
        return Response(
            {
                "inadimplente": valor,
                "afetados": [str(e.id) for e in afetados],
            }
        )

    @action(detail=True, methods=["post"], url_path="enviar-convite")
    def enviar_convite(self, request, pk=None):
        eleitor = self.get_object()
        eleitor.convite_token = secrets.token_urlsafe(48)
        eleitor.convite_expira_em = timezone.now() + timedelta(days=7)
        eleitor.save(update_fields=["convite_token", "convite_expira_em"])

        frontend_base_url = getattr(settings, "FRONTEND_APP_URL", "http://localhost:3000").rstrip("/")
        convite_url = f"{frontend_base_url}/cadastro/{eleitor.convite_token}"

        send_mail(
            subject="Convite para cadastro - Votação Online",
            message=(
                f"Olá, {eleitor.nome}.\n\n"
                f"Acesse o link abaixo para concluir seu cadastro:\n{convite_url}\n\n"
                "Se você não solicitou este acesso, ignore esta mensagem."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[eleitor.email],
            fail_silently=False,
        )

        return Response(
            {"message": "Convite enviado"},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["get", "post"],
        url_path="autocadastro/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def autocadastro(self, request, token=None):
        condominio = get_object_or_404(Condominio, autocadastro_token=token)
        if not condominio.autocadastro_ativo:
            return Response(
                {"error": "O autocadastro deste condomínio não está liberado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == "GET":
            return Response(
                {
                    "condominio_nome": condominio.nome,
                    "blocos": condominio.blocos or [],
                }
            )

        # POST: morador se autocadastra
        serializer = EleitorSerializer(
            data={**request.data, "condominio": str(condominio.id)}
        )
        serializer.is_valid(raise_exception=True)
        convite_token = secrets.token_urlsafe(48)
        serializer.save(
            convite_token=convite_token,
            convite_expira_em=timezone.now() + timedelta(days=7),
        )
        return Response(
            {"message": "Cadastro iniciado", "token": convite_token},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="autocadastro/(?P<token>[^/.]+)/ja-cadastrado/solicitar",
        permission_classes=[AllowAny],
    )
    def ja_cadastrado_solicitar(self, request, token=None):
        """Morador já importado pela administração: envia código OTP ao e-mail
        cadastrado para ele completar o cadastro (biometria) na própria ficha,
        sem criar duplicata."""
        condominio = get_object_or_404(Condominio, autocadastro_token=token)
        if not condominio.autocadastro_ativo:
            return Response(
                {"error": "O autocadastro deste condomínio não está liberado."},
                status=status.HTTP_403_FORBIDDEN,
            )
        email = str(request.data.get("email") or "").strip().lower()
        if not email:
            return Response(
                {"error": "Informe o e-mail."}, status=status.HTTP_400_BAD_REQUEST
            )
        eleitor = (
            Eleitor.objects.filter(condominio=condominio, email__iexact=email)
            .order_by("criado_em")
            .first()
        )
        if not eleitor:
            return Response(
                {"error": "E-mail não encontrado. Use o formulário de novo cadastro."},
                status=status.HTTP_404_NOT_FOUND,
            )
        sent_key = f"autocad_sent:{eleitor.id}"
        enviados = cache.get(sent_key, 0)
        if enviados >= 3:
            return Response(
                {"error": "Muitos envios. Aguarde alguns minutos e tente de novo."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(sent_key, enviados + 1, 600)
        code = gerar_otp(f"autocad:{eleitor.id}")
        send_mail(
            subject="Código para completar seu cadastro - Votação Online",
            message=(
                f"Olá, {eleitor.nome}.\n\n"
                f"Seu código para completar o cadastro é: {code}\n\n"
                "Válido por 10 minutos. Se você não solicitou, ignore esta mensagem."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[eleitor.email],
            fail_silently=False,
        )
        parts = eleitor.email.split("@")
        masked = parts[0][0] + "***@" + parts[1] if len(parts) == 2 else "***"
        return Response({"sent": True, "email_masked": masked})

    @action(
        detail=False,
        methods=["post"],
        url_path="autocadastro/(?P<token>[^/.]+)/ja-cadastrado/confirmar",
        permission_classes=[AllowAny],
    )
    def ja_cadastrado_confirmar(self, request, token=None):
        """Valida o código OTP e emite o token de convite da ficha existente,
        levando o morador direto ao cadastro de biometria."""
        condominio = get_object_or_404(Condominio, autocadastro_token=token)
        if not condominio.autocadastro_ativo:
            return Response(
                {"error": "O autocadastro deste condomínio não está liberado."},
                status=status.HTTP_403_FORBIDDEN,
            )
        email = str(request.data.get("email") or "").strip().lower()
        code = str(request.data.get("code") or "").strip()
        eleitor = (
            Eleitor.objects.filter(condominio=condominio, email__iexact=email)
            .order_by("criado_em")
            .first()
        )
        if eleitor:
            att_key = f"autocad_att:{eleitor.id}"
            tentativas = cache.get(att_key, 0)
            if tentativas >= 5:
                return Response(
                    {"error": "Muitas tentativas. Solicite um novo código."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            cache.set(att_key, tentativas + 1, 600)
        if not eleitor or not code or not validar_otp(f"autocad:{eleitor.id}", code):
            return Response(
                {"error": "Código inválido ou expirado."},
                status=status.HTTP_403_FORBIDDEN,
            )
        eleitor.convite_token = secrets.token_urlsafe(48)
        eleitor.convite_expira_em = timezone.now() + timedelta(days=7)
        eleitor.save(update_fields=["convite_token", "convite_expira_em"])
        return Response({"token": eleitor.convite_token})

    @action(
        detail=False,
        methods=["get"],
        url_path="convite/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def validar_convite(self, request, token=None):
        eleitor = get_object_or_404(Eleitor, convite_token=token)
        if eleitor.convite_expira_em and timezone.now() > eleitor.convite_expira_em:
            return Response(
                {"error": "Convite expirado. Solicite um novo."},
                status=status.HTTP_410_GONE,
            )
        return Response(
            {
                "id": str(eleitor.id),
                "nome": eleitor.nome,
                "apartamento": eleitor.apartamento,
                "cadastro_completo": eleitor.cadastro_completo,
            }
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="onboarding/(?P<token>[^/.]+)",
        permission_classes=[AllowAny],
    )
    def onboarding(self, request, token=None):
        eleitor = get_object_or_404(Eleitor, convite_token=token)
        if eleitor.convite_expira_em and timezone.now() > eleitor.convite_expira_em:
            return Response(
                {"error": "Convite expirado. Solicite um novo."},
                status=status.HTTP_410_GONE,
            )
        serializer = EleitorOnboardingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        eleitor.biometria_hash = serializer.validated_data["biometria_hash"]
        eleitor.cadastro_completo = True
        eleitor.convite_token = None
        eleitor.convite_expira_em = None
        eleitor.save(
            update_fields=[
                "biometria_hash",
                "cadastro_completo",
                "convite_token",
                "convite_expira_em",
            ]
        )

        return Response(
            {"message": "Cadastro completo"},
            status=status.HTTP_200_OK,
        )

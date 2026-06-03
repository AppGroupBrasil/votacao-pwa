from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response

from apps.eleitores.models import Eleitor
from core.request_info import presenca_request_defaults
from core.permissions import IsAdminWithRole, get_user_condominios

from .audit import registrar_log
from .ata_ia import AtaIAError, gerar_ata, transcrever_link
from .ata_pdf import gerar_pdf
from .models import Assembleia, Ata, LogAuditoria, Presenca, Questao
from .serializers import (
    AssembleiaListSerializer,
    AssembleiaSerializer,
    AtaSerializer,
    LogAuditoriaSerializer,
    PresencaSerializer,
    QuestaoCreateSerializer,
    QuestaoSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def assembleias_abertas(request):
    """Endpoint público: retorna assembleias com votação aberta."""
    qs = Assembleia.objects.filter(status=Assembleia.Status.ABERTA).values(
        "id", "titulo"
    )
    return Response(list(qs))


class AssembleiaViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAdminWithRole]
    search_fields = ["titulo"]
    filterset_fields = ["condominio", "status"]

    def get_queryset(self):
        qs = Assembleia.objects.select_related("condominio").prefetch_related(
            "questoes__opcoes", "votantes", "presencas"
        )
        cond_ids = get_user_condominios(self.request.user)
        if cond_ids is not None:
            qs = qs.filter(condominio_id__in=cond_ids)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return AssembleiaListSerializer
        return AssembleiaSerializer

    def update(self, request, *args, **kwargs):
        assembleia = self.get_object()
        if assembleia.status == Assembleia.Status.ENCERRADA:
            return Response(
                {"error": "Não é possível editar uma assembleia encerrada."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        assembleia = self.get_object()
        if assembleia.status == Assembleia.Status.ENCERRADA:
            return Response(
                {"error": "Não é possível editar uma assembleia encerrada."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        assembleia = self.get_object()
        if assembleia.status == Assembleia.Status.ABERTA:
            return Response(
                {"error": "Não é possível excluir uma assembleia com votação aberta. Encerre primeiro."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="abrir")
    def abrir(self, request, pk=None):
        assembleia = self.get_object()
        if assembleia.status != Assembleia.Status.RASCUNHO:
            return Response(
                {"error": "Só é possível abrir assembleias em rascunho"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not assembleia.questoes.exists():
            return Response(
                {"error": "A assembleia precisa ter pelo menos uma questão"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assembleia.status = Assembleia.Status.ABERTA
        assembleia.save(update_fields=["status"])
        registrar_log(request, assembleia, LogAuditoria.Acao.ABRIR, "Votação aberta.")
        return Response(AssembleiaSerializer(assembleia).data)

    @action(detail=True, methods=["post"], url_path="encerrar")
    def encerrar(self, request, pk=None):
        assembleia = self.get_object()
        if assembleia.status != Assembleia.Status.ABERTA:
            return Response(
                {"error": "Só é possível encerrar assembleias abertas"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assembleia.status = Assembleia.Status.ENCERRADA
        assembleia.save(update_fields=["status"])
        registrar_log(request, assembleia, LogAuditoria.Acao.ENCERRAR, "Votação encerrada.")
        return Response(AssembleiaSerializer(assembleia).data)

    @action(detail=True, methods=["post"], url_path="marcar-presenca")
    def marcar_presenca(self, request, pk=None):
        """Síndico marca presença manualmente.

        Duas formas:
        - eleitor_id: morador já cadastrado (preserva integridade do quórum).
        - nome + apartamento (+ bloco): morador avulso, ainda sem cadastro.
        """
        assembleia = self.get_object()
        if assembleia.status == Assembleia.Status.ENCERRADA:
            return Response(
                {"error": "Assembleia encerrada. Não é possível marcar presença."},
                status=status.HTTP_403_FORBIDDEN,
            )

        eleitor_id = request.data.get("eleitor_id")
        if eleitor_id:
            try:
                eleitor = Eleitor.objects.get(
                    id=eleitor_id, condominio=assembleia.condominio
                )
            except Eleitor.DoesNotExist:
                return Response(
                    {"error": "Morador não encontrado neste condomínio."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if getattr(eleitor, "bloqueado", False):
                return Response(
                    {"error": "Este morador está bloqueado."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if Presenca.objects.filter(
                assembleia=assembleia, eleitor=eleitor
            ).exists():
                return Response(
                    {"error": "Este morador já está presente."},
                    status=status.HTTP_409_CONFLICT,
                )
            perfil = (
                eleitor.perfil
                if eleitor.perfil in ("proprietario", "procurador")
                else "proprietario"
            )
            presenca = Presenca.objects.create(
                assembleia=assembleia,
                eleitor=eleitor,
                nome=eleitor.nome,
                bloco=eleitor.bloco,
                apartamento=eleitor.apartamento,
                perfil=perfil,
                metodo_auth="manual",
                **presenca_request_defaults(request),
            )
        else:
            nome = str(request.data.get("nome", "")).strip()[:200]
            apartamento = str(request.data.get("apartamento", "")).strip()[:20]
            bloco = str(request.data.get("bloco", "")).strip()[:20]
            if not nome or not apartamento:
                return Response(
                    {"error": "Informe o nome e o apartamento do morador."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            presenca = Presenca.objects.create(
                assembleia=assembleia,
                eleitor=None,
                nome=nome,
                bloco=bloco,
                apartamento=apartamento,
                perfil="proprietario",
                metodo_auth="manual",
                **presenca_request_defaults(request),
            )
        registrar_log(
            request, assembleia, LogAuditoria.Acao.MARCAR_PRESENCA,
            f"Presença registrada: {presenca.nome} ({presenca.apartamento}).",
        )
        return Response(
            PresencaSerializer(presenca).data, status=status.HTTP_201_CREATED
        )

    def _get_ata(self, assembleia):
        ata, _ = Ata.objects.get_or_create(assembleia=assembleia)
        return ata

    @action(detail=True, methods=["get", "patch"], url_path="ata")
    def ata(self, request, pk=None):
        """GET retorna (ou cria) a ata; PATCH salva link/transcrição/ata/provedor."""
        assembleia = self.get_object()
        ata = self._get_ata(assembleia)
        if request.method == "GET":
            return Response(AtaSerializer(ata).data)

        editaveis = ("link_gravacao", "transcricao", "ata_texto", "provedor_ia")
        dados = {k: request.data[k] for k in editaveis if k in request.data}
        serializer = AtaSerializer(ata, data=dados, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if "transcricao" in dados and ata.status == Ata.Status.PENDENTE:
            ata.status = Ata.Status.TRANSCRITA
            ata.save(update_fields=["status"])
        return Response(AtaSerializer(ata).data)

    @action(detail=True, methods=["get"], url_path="ata-pdf")
    def ata_pdf(self, request, pk=None):
        """Gera e devolve o PDF oficial da ata da assembleia."""
        assembleia = self.get_object()
        pdf = gerar_pdf(assembleia)
        resp = HttpResponse(pdf, content_type="application/pdf")
        nome = (assembleia.titulo or "ata").lower().replace(" ", "-")[:60]
        resp["Content-Disposition"] = f'attachment; filename="ata-{nome}.pdf"'
        return resp

    @action(detail=True, methods=["post"], url_path="transcrever")
    def transcrever(self, request, pk=None):
        """Transcreve automaticamente o link de gravação (Groq Whisper)."""
        assembleia = self.get_object()
        ata = self._get_ata(assembleia)
        link = str(request.data.get("link_gravacao", ata.link_gravacao)).strip()
        if not link:
            return Response(
                {"error": "Informe o link da gravação."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ata.link_gravacao = link
        ata.status = Ata.Status.TRANSCREVENDO
        ata.save(update_fields=["link_gravacao", "status"])
        try:
            texto = transcrever_link(link)
        except AtaIAError as exc:
            ata.status = Ata.Status.ERRO
            ata.erro_mensagem = str(exc)[:500]
            ata.save(update_fields=["status", "erro_mensagem"])
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        ata.transcricao = texto
        ata.status = Ata.Status.TRANSCRITA
        ata.erro_mensagem = ""
        ata.save(update_fields=["transcricao", "status", "erro_mensagem"])
        registrar_log(
            request, assembleia, LogAuditoria.Acao.TRANSCREVER,
            "Gravação transcrita automaticamente.",
        )
        return Response(AtaSerializer(ata).data)

    @action(detail=True, methods=["post"], url_path="gerar-ata")
    def gerar_ata(self, request, pk=None):
        """Gera resumo + ata pela IA a partir da transcrição já salva/enviada."""
        assembleia = self.get_object()
        ata = self._get_ata(assembleia)
        transcricao = str(request.data.get("transcricao", ata.transcricao)).strip()
        provedor = request.data.get("provedor_ia", ata.provedor_ia)
        if not transcricao:
            return Response(
                {"error": "Cole a transcrição da gravação antes de gerar a ata."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ata.transcricao = transcricao
        ata.provedor_ia = provedor
        try:
            resumo, ata_texto = gerar_ata(
                transcricao,
                titulo=assembleia.titulo,
                condominio_nome=assembleia.condominio.nome,
                provedor=provedor,
            )
        except AtaIAError as exc:
            ata.status = Ata.Status.ERRO
            ata.erro_mensagem = str(exc)[:500]
            ata.save(update_fields=["transcricao", "provedor_ia", "status", "erro_mensagem"])
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        ata.resumo = resumo
        ata.ata_texto = ata_texto
        ata.status = Ata.Status.PRONTA
        ata.erro_mensagem = ""
        ata.save()
        registrar_log(
            request, assembleia, LogAuditoria.Acao.GERAR_ATA,
            f"Ata gerada por IA ({provedor}).",
        )
        return Response(AtaSerializer(ata).data)

    @action(detail=True, methods=["get"], url_path="logs")
    def logs(self, request, pk=None):
        """Trilha de auditoria da assembleia."""
        assembleia = self.get_object()
        qs = assembleia.logs.all()
        return Response(LogAuditoriaSerializer(qs, many=True).data)


class QuestaoViewSet(viewsets.ModelViewSet):
    serializer_class = QuestaoSerializer
    permission_classes = [IsAdminWithRole]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Questao.objects.filter(
            assembleia_id=self.kwargs["assembleia_pk"]
        ).prefetch_related("opcoes")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return QuestaoCreateSerializer
        return QuestaoSerializer

    def _check_assembleia_locked(self):
        """Retorna Response de erro se assembleia não está em rascunho."""
        assembleia = Assembleia.objects.get(pk=self.kwargs["assembleia_pk"])
        if assembleia.status != Assembleia.Status.RASCUNHO:
            return Response(
                {"error": "Não é possível alterar questões após a votação ser aberta ou encerrada."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def create(self, request, *args, **kwargs):
        err = self._check_assembleia_locked()
        if err:
            return err
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        err = self._check_assembleia_locked()
        if err:
            return err
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        err = self._check_assembleia_locked()
        if err:
            return err
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        err = self._check_assembleia_locked()
        if err:
            return err
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(assembleia_id=self.kwargs["assembleia_pk"])

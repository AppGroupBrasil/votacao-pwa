import secrets

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdminWithRole, get_user_condominios

from .models import Condominio
from .serializers import CondominioSerializer


class CondominioViewSet(viewsets.ModelViewSet):
    serializer_class = CondominioSerializer
    permission_classes = [IsAdminWithRole]
    search_fields = ["nome", "cnpj"]
    filterset_fields = ["cnpj"]

    def get_queryset(self):
        cond_ids = get_user_condominios(self.request.user)
        qs = Condominio.objects.all()
        if cond_ids is not None:
            qs = qs.filter(id__in=cond_ids)
        return qs

    def perform_create(self, serializer):
        # Vincula o condomínio recém-criado ao perfil do síndico; sem isso o
        # condomínio nasce órfão e some da própria lista/escopo do usuário.
        condominio = serializer.save()
        user = self.request.user
        if not user.is_superuser:
            perfil = getattr(user, "perfil_admin", None)
            if perfil is not None:
                perfil.condominios.add(condominio)

    @action(detail=True, methods=["post"], url_path="autocadastro-link")
    def gerar_link_autocadastro(self, request, pk=None):
        """Gera (ou regenera) o token do link público de autocadastro."""
        condominio = self.get_object()
        condominio.autocadastro_token = secrets.token_urlsafe(24)
        condominio.save(update_fields=["autocadastro_token"])
        return Response({"autocadastro_token": condominio.autocadastro_token})

    @action(detail=True, methods=["get"], url_path="biometria-resumo")
    def biometria_resumo(self, request, pk=None):
        """Quantos moradores da planilha já têm o rosto pronto para a
        assembleia — é o número que o síndico acompanha antes do dia."""
        from apps.eleitores.facial import tem_biometria
        from apps.eleitores.models import Eleitor, IdentidadeFacial

        condominio = self.get_object()
        cpfs = set(
            Eleitor.objects.filter(condominio=condominio)
            .exclude(cpf_hash__isnull=True)
            .exclude(cpf_hash="")
            .values_list("cpf_hash", flat=True)
        )
        com_rosto = antecipados = 0
        for ident in (
            IdentidadeFacial.objects.filter(condominio=condominio, cpf_hash__in=cpfs)
            .only("descriptor", "descriptors", "cadastro_antecipado_em")
            .iterator()
        ):
            if tem_biometria(ident):
                com_rosto += 1
                if ident.cadastro_antecipado_em:
                    antecipados += 1
        return Response(
            {
                "moradores_com_cpf": len(cpfs),
                "com_rosto": com_rosto,
                "antecipados": antecipados,
            }
        )

    @action(detail=True, methods=["get"], url_path="cadastros-faciais")
    def cadastros_faciais(self, request, pk=None):
        """Quem cadastrou o rosto, com o que a administração precisa conferir
        antes da assembleia: está na planilha? com qual perfil? a unidade está
        inadimplente? o rosto bate com o de outro CPF? Sem as fotos (pesadas),
        que vêm uma a uma pela rota de foto."""
        from apps.eleitores.facial import tem_biometria
        from apps.eleitores.models import Eleitor, IdentidadeFacial, normalizar_unidade

        condominio = self.get_object()
        planilha = {}
        inadimplentes = set()
        for e in Eleitor.objects.filter(condominio=condominio).only(
            "cpf_hash", "perfil", "bloco", "apartamento", "inadimplente"
        ):
            unidade = (normalizar_unidade(e.bloco), normalizar_unidade(e.apartamento))
            if e.cpf_hash:
                planilha.setdefault(e.cpf_hash, set()).add(unidade)
            if e.inadimplente:
                inadimplentes.add(unidade)

        cadastros = []
        for ident in (
            IdentidadeFacial.objects.filter(condominio=condominio)
            .defer("selfie")
            .order_by("bloco", "apartamento", "nome")
            .iterator()
        ):
            unidade = (normalizar_unidade(ident.bloco), normalizar_unidade(ident.apartamento))
            unidades_do_cpf = planilha.get(ident.cpf_hash) if ident.cpf_hash else None
            cadastros.append(
                {
                    "id": str(ident.id),
                    "nome": ident.nome,
                    "bloco": ident.bloco,
                    "apartamento": ident.apartamento,
                    "perfil": ident.perfil,
                    "na_planilha": bool(unidades_do_cpf),
                    # CPF da planilha, mas declarado em outra unidade.
                    "unidade_diferente_da_planilha": bool(
                        unidades_do_cpf and unidade not in unidades_do_cpf
                    ),
                    "inadimplente": bool(unidade[1]) and unidade in inadimplentes,
                    "suspeita_duplicidade": ident.suspeita_duplicidade,
                    "tem_rosto": tem_biometria(ident),
                    "cadastro_antecipado_em": ident.cadastro_antecipado_em,
                    "criado_em": ident.criado_em,
                }
            )
        # Sem CPF na planilha, "fora da planilha" seria todo mundo: a tela só
        # aponta isso quando a planilha existe.
        return Response({"cadastros": cadastros, "tem_planilha": bool(planilha)})

    @action(
        detail=True,
        methods=["get"],
        url_path=r"cadastros-faciais/(?P<identidade_id>[0-9a-f-]{36})/foto",
    )
    def cadastro_facial_foto(self, request, pk=None, identidade_id=None):
        from apps.eleitores.models import IdentidadeFacial

        condominio = self.get_object()
        ident = get_object_or_404(
            IdentidadeFacial.objects.only("selfie"),
            id=identidade_id,
            condominio=condominio,
        )
        return Response({"selfie": ident.selfie})

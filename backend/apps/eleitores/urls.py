from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EleitorViewSet,
    SolicitacaoExclusaoViewSet,
    cadastro_facial_consultar_cpf,
    cadastro_facial_info,
    cadastro_facial_salvar,
    criar_solicitacao_exclusao,
)

router = DefaultRouter()
router.register(
    "solicitacoes-exclusao",
    SolicitacaoExclusaoViewSet,
    basename="solicitacao-exclusao",
)
router.register("", EleitorViewSet, basename="eleitor")

urlpatterns = [
    path("exclusao/solicitar/", criar_solicitacao_exclusao, name="exclusao-solicitar"),
    path(
        "cadastro-facial/<uuid:condominio_id>/",
        cadastro_facial_info,
        name="cadastro-facial-info",
    ),
    path(
        "cadastro-facial/<uuid:condominio_id>/consultar-cpf/",
        cadastro_facial_consultar_cpf,
        name="cadastro-facial-consultar-cpf",
    ),
    path(
        "cadastro-facial/<uuid:condominio_id>/salvar/",
        cadastro_facial_salvar,
        name="cadastro-facial-salvar",
    ),
    path("", include(router.urls)),
]

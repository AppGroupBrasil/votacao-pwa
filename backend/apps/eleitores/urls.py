from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EleitorViewSet,
    SolicitacaoExclusaoViewSet,
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
    path("", include(router.urls)),
]

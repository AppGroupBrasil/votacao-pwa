from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EnqueteViewSet,
    ListaPresencaViewSet,
    enquete_publica,
    lista_presenca_publica,
    registrar_presenca_manual,
    resolver_codigo_enquete,
    resolver_codigo_lista,
    resultado_enquete,
    votar_enquete,
)

router = DefaultRouter()
router.register("listas-presenca", ListaPresencaViewSet, basename="lista-presenca")
router.register("", EnqueteViewSet, basename="enquete")

urlpatterns = [
    path(
        "listas-presenca/resolver/<str:codigo>/",
        resolver_codigo_lista,
        name="lista-presenca-resolver-codigo",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/publica/",
        lista_presenca_publica,
        name="lista-presenca-publica",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/registrar/",
        registrar_presenca_manual,
        name="lista-presenca-registrar",
    ),
    path(
        "resolver/<str:codigo>/",
        resolver_codigo_enquete,
        name="enquete-resolver-codigo",
    ),
    path("<uuid:enquete_id>/publica/", enquete_publica, name="enquete-publica"),
    path("<uuid:enquete_id>/votar/", votar_enquete, name="enquete-votar"),
    path(
        "<uuid:enquete_id>/resultado/",
        resultado_enquete,
        name="enquete-resultado",
    ),
    path("", include(router.urls)),
]

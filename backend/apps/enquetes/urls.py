from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EnqueteViewSet,
    ListaPresencaViewSet,
    consultar_cpf_presenca,
    enquete_publica,
    lista_presenca_publica,
    presenca_enviar_codigo,
    presenca_reconhecer_facial,
    presenca_verificar_codigo,
    registrar_presenca_facial,
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
        "listas-presenca/<uuid:lista_id>/consultar-cpf/",
        consultar_cpf_presenca,
        name="lista-presenca-consultar-cpf",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/facial/reconhecer/",
        presenca_reconhecer_facial,
        name="lista-presenca-facial-reconhecer",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/facial/registrar/",
        registrar_presenca_facial,
        name="lista-presenca-facial-registrar",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/enviar-codigo/",
        presenca_enviar_codigo,
        name="lista-presenca-enviar-codigo",
    ),
    path(
        "listas-presenca/<uuid:lista_id>/verificar-codigo/",
        presenca_verificar_codigo,
        name="lista-presenca-verificar-codigo",
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

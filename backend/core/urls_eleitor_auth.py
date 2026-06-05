from django.urls import path

from .views_eleitor_auth import (
    eleitor_cadastrar_biometria,
    eleitor_cadastro,
    eleitor_login,
    eleitor_presenca,
    eleitor_trocar_senha,
)

urlpatterns = [
    path("login/", eleitor_login, name="eleitor-login"),
    path("cadastro/", eleitor_cadastro, name="eleitor-cadastro"),
    path("trocar-senha/", eleitor_trocar_senha, name="eleitor-trocar-senha"),
    path("biometria/", eleitor_cadastrar_biometria, name="eleitor-biometria"),
    path("presenca/", eleitor_presenca, name="eleitor-presenca"),
]

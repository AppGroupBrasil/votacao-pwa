from django.urls import path
from .views_provisioning import ProvisioningView
from .views_cadastro_sync import CadastroSyncView

urlpatterns = [
    path("usuario/", ProvisioningView.as_view()),
    path("usuario", ProvisioningView.as_view()),
    path("cadastro/", CadastroSyncView.as_view()),
    path("cadastro", CadastroSyncView.as_view()),
]

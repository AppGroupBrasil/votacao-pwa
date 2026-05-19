from django.urls import path
from .views_provisioning import ProvisioningView

urlpatterns = [
    path("usuario/", ProvisioningView.as_view()),
    path("usuario", ProvisioningView.as_view()),
]

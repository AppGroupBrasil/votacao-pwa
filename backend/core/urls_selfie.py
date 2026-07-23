from django.urls import path

from core.views_selfie import selfie_auth_verify

urlpatterns = [
    path("auth/verify/", selfie_auth_verify, name="selfie-auth-verify"),
]

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EnqueteViewSet,
    enquete_publica,
    resultado_enquete,
    votar_enquete,
)

router = DefaultRouter()
router.register("", EnqueteViewSet, basename="enquete")

urlpatterns = [
    path("<uuid:enquete_id>/publica/", enquete_publica, name="enquete-publica"),
    path("<uuid:enquete_id>/votar/", votar_enquete, name="enquete-votar"),
    path(
        "<uuid:enquete_id>/resultado/",
        resultado_enquete,
        name="enquete-resultado",
    ),
    path("", include(router.urls)),
]

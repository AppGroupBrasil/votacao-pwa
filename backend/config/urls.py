from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def ratelimited(_request, _exception=None):
    return JsonResponse(
        {"error": "Muitas requisições. Aguarde alguns instantes e tente novamente."},
        status=429,
    )


handler429 = "config.urls.ratelimited"


def api_root(_request):
    return JsonResponse(
        {
            "status": "ok",
            "service": "votacao-online",
            "endpoints": {
                "auth": "/api/auth/",
                "condominios": "/api/condominios/",
                "eleitores": "/api/eleitores/",
                "assembleias": "/api/assembleias/",
                "votos": "/api/votos/",
            },
        }
    )

def healthz(_request):
    from django.db import connection
    try:
        connection.ensure_connection()
        return JsonResponse({"status": "ok"})
    except Exception:
        return JsonResponse({"status": "error"}, status=503)


import os

ADMIN_URL_PATH = os.getenv("DJANGO_ADMIN_PATH", "admin/").strip("/") + "/"

urlpatterns = [
    path(ADMIN_URL_PATH, admin.site.urls),
    path("api/", api_root),
    path("api/healthz/", healthz),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/auth/", include("core.urls_auth")),
    path("api/webauthn/", include("core.urls_webauthn")),
    path("api/biometria/", include("core.urls_biometria")),
    path("api/otp/", include("core.urls_otp")),
    path("api/condominios/", include("apps.condominios.urls")),
    path("api/eleitores/", include("apps.eleitores.urls")),
    path("api/assembleias/", include("apps.assembleias.urls")),
    path("api/votos/", include("apps.votos.urls")),
    path("api/provisioning/", include("core.urls_provisioning")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

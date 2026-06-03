import secrets

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import IsAdminWithRole, get_user_condominios

from .models import Condominio
from .serializers import CondominioSerializer


class CondominioViewSet(viewsets.ModelViewSet):
    serializer_class = CondominioSerializer
    permission_classes = [IsAdminWithRole]
    search_fields = ["nome", "cnpj"]
    filterset_fields = ["cnpj"]

    def get_queryset(self):
        cond_ids = get_user_condominios(self.request.user)
        qs = Condominio.objects.all()
        if cond_ids is not None:
            qs = qs.filter(id__in=cond_ids)
        return qs

    @action(detail=True, methods=["post"], url_path="autocadastro-link")
    def gerar_link_autocadastro(self, request, pk=None):
        """Gera (ou regenera) o token do link público de autocadastro."""
        condominio = self.get_object()
        condominio.autocadastro_token = secrets.token_urlsafe(24)
        condominio.save(update_fields=["autocadastro_token"])
        return Response({"autocadastro_token": condominio.autocadastro_token})

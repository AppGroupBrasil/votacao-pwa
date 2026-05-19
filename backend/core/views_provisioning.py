import os
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.authentication import BaseAuthentication


class _NoAuth(BaseAuthentication):
    def authenticate(self, request):
        return None


class ProvisioningView(APIView):
    authentication_classes = [_NoAuth]
    permission_classes = [AllowAny]

    def post(self, request):
        expected = os.getenv("PROVISIONING_SECRET", "")
        provided = request.headers.get("X-Provisioning-Secret", "")
        if not expected or provided != expected:
            return Response({"error": "Assinatura inválida"}, status=403)

        body = request.data or {}
        usuario_id = body.get("usuario_id")
        email = body.get("email")
        nome = body.get("nome")
        if not (usuario_id and email and nome):
            return Response({"error": "Campos obrigatórios ausentes"}, status=400)

        status_lic = body.get("status", "ativa")
        ativo = status_lic in ("ativa", "trial")

        User = get_user_model()
        user, created = User.objects.update_or_create(
            email=email,
            defaults={
                "username": email,
                "first_name": (nome or email)[:150],
                "is_active": ativo,
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])

        return Response({"ok": True, "usuario_id": usuario_id, "id_local": user.id})

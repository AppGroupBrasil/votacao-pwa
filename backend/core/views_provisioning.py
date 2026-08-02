import hmac
import os
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
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

    # Segredo compartilhado: sem limite, dá para tentar adivinhá-lo à vontade.
    @method_decorator(ratelimit(key="ip", rate="20/m", block=True))
    def post(self, request):
        expected = os.getenv("PROVISIONING_SECRET", "")
        provided = request.headers.get("X-Provisioning-Secret", "")
        # compare_digest: a comparação leva o mesmo tempo com segredo certo ou
        # errado, então o tempo de resposta não entrega o valor.
        if not expected or not hmac.compare_digest(provided, expected):
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
        # O e-mail não é único no Django: com mais de uma conta usando o mesmo,
        # update_or_create estouraria. Fica com a mais antiga (a original).
        user = User.objects.filter(email__iexact=email).order_by("id").first()
        created = user is None
        if created:
            user = User.objects.create(
                username=email[:150],
                email=email,
                first_name=(nome or email)[:150],
                is_active=ativo,
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
        elif user.is_superuser or user.is_staff:
            # Conta de administrador do próprio sistema: o licenciamento externo
            # não pode renomear nem desativar quem opera as assembleias.
            return Response(
                {"error": "Conta administrativa: alteração não permitida."},
                status=403,
            )
        else:
            user.first_name = (nome or email)[:150]
            user.is_active = ativo
            user.save(update_fields=["first_name", "is_active"])

        return Response({"ok": True, "usuario_id": usuario_id, "id_local": user.id})

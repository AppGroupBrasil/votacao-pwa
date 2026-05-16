from datetime import timedelta

from django.contrib.auth.models import User
from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor


class EleitorFlowTests(APITestCase):
    def setUp(self):
        self.condominio = Condominio.objects.create(
            nome="Residencial Alpha",
            cnpj="12.345.678/0001-90",
            total_unidades=10,
        )
        self.admin = User.objects.create_superuser(
            username="master",
            email="master@example.com",
            password="admin12345",
        )
        self.eleitor = Eleitor.objects.create(
            condominio=self.condominio,
            nome="Maria Teste",
            cpf_hash="a" * 64,
            apartamento="101",
            email="maria@example.com",
            convite_token="token-onboarding",
            webauthn_credential={"credential_id": "cred-1", "public_key": "pk"},
        )

    def test_onboarding_preserves_existing_webauthn_credential(self):
        response = self.client.post(
            "/api/eleitores/onboarding/token-onboarding/",
            {
                "biometria_hash": "b" * 64,
                "webauthn_credential": {"skipped": True},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.eleitor.refresh_from_db()
        self.assertEqual(self.eleitor.biometria_hash, "b" * 64)
        self.assertEqual(
            self.eleitor.webauthn_credential,
            {"credential_id": "cred-1", "public_key": "pk"},
        )
        self.assertTrue(self.eleitor.cadastro_completo)
        self.assertIsNone(self.eleitor.convite_token)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_APP_URL="https://app.example.com",
    )
    def test_enviar_convite_sends_email_with_frontend_link(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/eleitores/{self.eleitor.id}/enviar-convite/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Convite enviado")
        self.assertNotIn("token", response.data)
        self.assertNotIn("url", response.data)
        self.eleitor.refresh_from_db()
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(
            f"https://app.example.com/cadastro/{self.eleitor.convite_token}",
            mail.outbox[0].body,
        )

    def test_validar_convite_expirado_retorna_410(self):
        self.eleitor.convite_expira_em = timezone.now() - timedelta(days=1)
        self.eleitor.save(update_fields=["convite_expira_em"])
        response = self.client.get(f"/api/eleitores/convite/{self.eleitor.convite_token}/")
        self.assertEqual(response.status_code, 410)

    def test_enviar_convite_renova_expiracao(self):
        self.client.force_authenticate(self.admin)
        antes = timezone.now()
        response = self.client.post(f"/api/eleitores/{self.eleitor.id}/enviar-convite/")
        self.assertEqual(response.status_code, 200)
        self.eleitor.refresh_from_db()
        self.assertIsNotNone(self.eleitor.convite_expira_em)
        self.assertGreater(self.eleitor.convite_expira_em, antes + timedelta(days=6))
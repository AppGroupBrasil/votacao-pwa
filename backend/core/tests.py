from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor


class AuthAndBiometriaTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="admin12345",
        )
        self.condominio = Condominio.objects.create(
            nome="Residencial Beta",
            cnpj="98.765.432/0001-10",
            total_unidades=20,
        )
        self.eleitor = Eleitor.objects.create(
            condominio=self.condominio,
            nome="João Teste",
            cpf_hash="c" * 64,
            apartamento="202",
            email="joao@example.com",
            biometria_hash="d" * 64,
        )

    def test_login_view_returns_tokens_for_valid_credentials(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "admin", "password": "admin12345"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)
        self.assertTrue(response.cookies["access_token"]["httponly"])
        self.assertEqual(response.data["username"], "admin")

    def test_facial_auth_rejects_invalid_signature(self):
        response = self.client.post(
            "/api/biometria/auth/verify/",
            {
                "eleitor_id": str(self.eleitor.id),
                "assembleia_id": "",
                "hash": "e" * 64,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_facial_auth_accepts_matching_signature(self):
        response = self.client.post(
            "/api/biometria/auth/verify/",
            {
                "eleitor_id": str(self.eleitor.id),
                "assembleia_id": "",
                "hash": "d" * 64,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["authenticated"])
        self.assertEqual(response.data["method"], "facial")
        self.assertIn("token", response.data)

    def test_healthz_endpoint_ok(self):
        response = self.client.get("/api/healthz/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_login_logout_via_cookie(self):
        login = self.client.post(
            "/api/auth/login/",
            {"username": "admin", "password": "admin12345"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        self.assertIn("access_token", login.cookies)

        # me/ deve funcionar com o cookie
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["username"], "admin")

        logout = self.client.post("/api/auth/logout/")
        self.assertEqual(logout.status_code, 200)

    def test_refresh_via_cookie(self):
        login = self.client.post(
            "/api/auth/login/",
            {"username": "admin", "password": "admin12345"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)
        refresh = self.client.post("/api/auth/refresh/")
        self.assertEqual(refresh.status_code, 200)
        self.assertIn("access_token", refresh.cookies)

    def test_refresh_sem_cookie_retorna_401(self):
        response = self.client.post("/api/auth/refresh/")
        self.assertEqual(response.status_code, 401)


class AutocadastroMoradorTests(APITestCase):
    def setUp(self):
        self.cond = Condominio.objects.create(
            nome="Residencial Longo", cnpj="12.345.678/0001-99", total_unidades=10
        )

    def test_texto_longo_nao_derruba_o_autocadastro(self):
        r = self.client.post(
            "/api/eleitor/cadastro/",
            {
                "cnpj": self.cond.cnpj,
                "nome": "Maria " + "Silva " * 60,
                "bloco": "Bloco A - Edifício Primavera",
                "apartamento": "Apartamento 1201 fundos",
                "senha": "123456",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        eleitor = Eleitor.objects.get(condominio=self.cond)
        self.assertLessEqual(len(eleitor.nome), 200)
        self.assertEqual((len(eleitor.bloco), len(eleitor.apartamento)), (20, 20))
        self.assertLessEqual(len(eleitor.email), 200)

    def test_autocadastro_recusa_dados_faltando_e_condominio_errado(self):
        base = {"cnpj": self.cond.cnpj, "nome": "Ana", "apartamento": "101", "senha": "123456"}
        for campo in ("nome", "apartamento", "senha"):
            r = self.client.post("/api/eleitor/cadastro/", {**base, campo: ""}, format="json")
            self.assertEqual(r.status_code, 400, campo)
        r = self.client.post("/api/eleitor/cadastro/", {**base, "senha": "123"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/eleitor/cadastro/", {**base, "cnpj": "00.000.000/0000-00"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertFalse(Eleitor.objects.exists())


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EntradaPorEmailTests(APITestCase):
    """Entrada na votação pelo e-mail da planilha: com código (padrão) ou
    direto, quando a assembleia não exige confirmação."""

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.assembleias.models import Assembleia, OpcaoVoto, Questao

        self.cond = Condominio.objects.create(
            nome="Residencial Email", cnpj="98.765.432/0001-10", total_unidades=10
        )
        self.eleitor = Eleitor.objects.create(
            condominio=self.cond, nome="Ana Email", bloco="A", apartamento="101",
            email="ana@exemplo.com",
        )
        agora = timezone.now()
        self.assembleia = Assembleia.objects.create(
            condominio=self.cond, titulo="AGO", status=Assembleia.Status.ABERTA,
            votacao_liberada=True, data_inicio=agora - timedelta(minutes=5),
            data_fim=agora + timedelta(hours=2),
        )
        self.questao = Questao.objects.create(assembleia=self.assembleia, titulo="Contas", ordem=1)
        self.opcao = OpcaoVoto.objects.create(questao=self.questao, texto="Sim", ordem=1)

    def _votar(self, token):
        return self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {"eleitor_id": str(self.eleitor.id), "questao_id": str(self.questao.id),
             "opcao_id": str(self.opcao.id), "auth_token": token},
            format="json",
        )

    def test_codigo_por_email_libera_o_voto(self):
        from django.core import mail

        corpo = {"email": "ANA@exemplo.com ", "assembleia_id": str(self.assembleia.id)}
        r = self.client.post("/api/otp/send-email/", corpo, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(mail.outbox), 1)
        codigo = mail.outbox[0].body.split("é: ")[1][:6]
        r = self.client.post("/api/otp/verify-email/", {**corpo, "code": "000000"}, format="json")
        self.assertEqual(r.status_code, 403)
        r = self.client.post("/api/otp/verify-email/", {**corpo, "code": codigo}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._votar(r.data["token"]).status_code, 201)
        # E-mail de fora do condomínio não recebe código.
        r = self.client.post(
            "/api/otp/send-email/",
            {"email": "estranho@exemplo.com", "assembleia_id": str(self.assembleia.id)},
            format="json",
        )
        self.assertNotEqual(r.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_entrada_direta_pelo_email_consegue_votar(self):
        corpo = {"email": "ana@exemplo.com", "assembleia_id": str(self.assembleia.id)}
        # Assembleia exige código: a entrada direta é recusada.
        r = self.client.post("/api/otp/acesso-direto/", corpo, format="json")
        self.assertEqual(r.status_code, 403)
        self.assembleia.exigir_confirmacao_email = False
        self.assembleia.save()
        r = self.client.post("/api/otp/acesso-direto/", corpo, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        r = self._votar(r.data["token"])
        self.assertEqual(r.status_code, 201, r.data)

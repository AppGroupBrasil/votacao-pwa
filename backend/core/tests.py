from django.contrib.auth.models import User
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


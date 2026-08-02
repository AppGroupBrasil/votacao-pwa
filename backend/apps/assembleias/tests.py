from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.assembleias.models import Assembleia, Questao
from core.models import PerfilAdmin


class CodigoCurtoTests(APITestCase):
    def setUp(self):
        self.condominio = Condominio.objects.create(
            nome="Residencial Beta",
            cnpj="98.765.432/0001-10",
            total_unidades=10,
        )

    def _criar_assembleia(self):
        agora = timezone.now()
        return Assembleia.objects.create(
            condominio=self.condominio,
            titulo="Assembleia Teste",
            data_inicio=agora,
            data_fim=agora + timedelta(hours=2),
            status=Assembleia.Status.ABERTA,
        )

    def test_codigo_curto_gerado_automaticamente(self):
        a = self._criar_assembleia()
        self.assertTrue(a.codigo_curto)
        self.assertLessEqual(len(a.codigo_curto), 8)

    def test_resolver_codigo_retorna_id(self):
        a = self._criar_assembleia()
        response = self.client.get(f"/api/assembleias/resolver/{a.codigo_curto}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assembleia_id"], str(a.id))

    def test_resolver_codigo_case_insensitive(self):
        a = self._criar_assembleia()
        response = self.client.get(
            f"/api/assembleias/resolver/{a.codigo_curto.lower()}/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assembleia_id"], str(a.id))

    def test_resolver_codigo_inexistente_404(self):
        response = self.client.get("/api/assembleias/resolver/ZZZZ/")
        self.assertEqual(response.status_code, 404)


class IsolamentoQuestoesTests(APITestCase):
    """O síndico de um condomínio não pode ver nem mexer nas questões de outro,
    mesmo tendo o id da assembleia (o resolvedor de código curto é público)."""

    def setUp(self):
        agora = timezone.now()
        self.cond_a = Condominio.objects.create(
            nome="Condomínio A", cnpj="11.111.111/0001-11", total_unidades=10
        )
        self.cond_b = Condominio.objects.create(
            nome="Condomínio B", cnpj="22.222.222/0001-22", total_unidades=10
        )
        self.assembleia_b = Assembleia.objects.create(
            condominio=self.cond_b,
            titulo="Pauta do vizinho",
            data_inicio=agora,
            data_fim=agora + timedelta(hours=2),
        )
        self.questao_b = Questao.objects.create(
            assembleia=self.assembleia_b, titulo="Aprovar obra?", ordem=1
        )

        self.sindico_a = User.objects.create_user(
            username="sindico_a", password="x", is_staff=True
        )
        perfil = PerfilAdmin.objects.create(user=self.sindico_a, role="sindico")
        perfil.condominios.add(self.cond_a)
        self.client.force_authenticate(user=self.sindico_a)

    def _url(self, sufixo=""):
        return f"/api/assembleias/{self.assembleia_b.id}/questoes/{sufixo}"

    def test_nao_lista_questoes_de_outro_condominio(self):
        r = self.client.get(self._url())
        self.assertEqual(r.status_code, 200)
        dados = r.data.get("results", r.data)
        self.assertEqual(len(dados), 0)

    def test_nao_cria_questao_em_outro_condominio(self):
        r = self.client.post(
            self._url(), {"titulo": "Invadida", "ordem": 2}, format="json"
        )
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.assembleia_b.questoes.count(), 1)

    def test_nao_libera_questao_de_outro_condominio(self):
        r = self.client.post(
            self._url(f"{self.questao_b.id}/liberar/"), {"liberar": True}, format="json"
        )
        self.assertEqual(r.status_code, 404)

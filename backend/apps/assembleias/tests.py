from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.assembleias.models import Assembleia


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

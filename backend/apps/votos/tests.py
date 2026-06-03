import json
from datetime import timedelta

from django.contrib.auth.models import User
from django.core import signing
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.assembleias.models import Assembleia, OpcaoVoto, Questao
from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor
from apps.votos.models import Voto


class VotoReportTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="relatorio-admin",
            email="relatorio@example.com",
            password="admin12345",
        )
        self.condominio = Condominio.objects.create(
            nome="Residencial Gama",
            cnpj="11.222.333/0001-44",
            total_unidades=50,
        )
        self.eleitor = Eleitor.objects.create(
            condominio=self.condominio,
            nome="Eleitor Relatorio",
            cpf_hash="f" * 64,
            bloco="B",
            apartamento="302",
            perfil="procurador",
            email="eleitor@example.com",
            cadastro_completo=True,
        )
        self.assembleia = Assembleia.objects.create(
            condominio=self.condominio,
            titulo="Assembleia de Relatório",
            descricao="Teste de auditoria do voto",
            data_inicio=timezone.now() - timedelta(hours=1),
            data_fim=timezone.now() + timedelta(hours=1),
            status=Assembleia.Status.ABERTA,
        )
        self.assembleia.votantes.add(self.eleitor)
        self.questao = Questao.objects.create(
            assembleia=self.assembleia,
            titulo="Aprovar orçamento?",
            descricao="",
            ordem=1,
        )
        self.opcao = OpcaoVoto.objects.create(
            questao=self.questao,
            texto="Sim",
            ordem=1,
        )

    def build_auth_token(self, method="facial", eleitor_id=None, assembleia_id=None):
        return signing.dumps(
            {
                "eleitor_id": str(eleitor_id or self.eleitor.id),
                "assembleia_id": str(assembleia_id or self.assembleia.id),
                "method": method,
            },
            salt="vote-auth",
        )

    def test_voto_persiste_ip_e_dispositivo(self):
        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(self.eleitor.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(method="facial"),
            },
            format="json",
            HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36",
            HTTP_X_FORWARDED_FOR="203.0.113.10",
        )

        self.assertEqual(response.status_code, 201)
        voto = Voto.objects.get(eleitor=self.eleitor, questao=self.questao)
        self.assertEqual(voto.ip_address, "203.0.113.10")
        self.assertIn("Windows", voto.device_info)
        self.assertIn("Chrome", voto.device_info)
        self.assertIn("Mozilla/5.0", voto.user_agent)

    def test_voto_usa_metodo_auth_do_token(self):
        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(self.eleitor.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(method="webauthn"),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        voto = Voto.objects.get(eleitor=self.eleitor, questao=self.questao)
        self.assertEqual(voto.metodo_auth, Voto.MetodoAuth.WEBAUTHN)

    def test_voto_rejeita_token_de_outro_eleitor(self):
        outro_eleitor = Eleitor.objects.create(
            condominio=self.condominio,
            nome="Outro Eleitor",
            cpf_hash="a" * 64,
            bloco="C",
            apartamento="401",
            perfil="proprietario",
            email="outro@example.com",
            cadastro_completo=True,
        )
        self.assembleia.votantes.add(outro_eleitor)

        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(self.eleitor.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(eleitor_id=outro_eleitor.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Voto.objects.filter(eleitor=self.eleitor, questao=self.questao).exists())

    def test_relatorio_detalhado_retorna_campos_de_auditoria(self):
        Voto.objects.create(
            assembleia=self.assembleia,
            eleitor=self.eleitor,
            questao=self.questao,
            opcao_escolhida=self.opcao,
            metodo_auth=Voto.MetodoAuth.OTP,
            ip_address="198.51.100.15",
            device_info="Android / Chrome",
            user_agent="Mozilla/5.0 (Linux; Android 14)",
        )

        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/votos/{self.assembleia.id}/relatorio/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["assembleia_titulo"], self.assembleia.titulo)
        self.assertEqual(response.data["total_registros"], 1)
        registro = response.data["votos"][0]
        self.assertEqual(registro["eleitor_nome"], self.eleitor.nome)
        self.assertEqual(registro["bloco"], self.eleitor.bloco)
        self.assertEqual(registro["apartamento"], self.eleitor.apartamento)
        self.assertEqual(registro["perfil"], self.eleitor.perfil)
        self.assertTrue(registro["por_procuracao"])
        self.assertEqual(registro["tipo_autenticacao"], "otp")
        self.assertNotIn("ip_address", registro)
        self.assertNotIn("device_info", registro)
        self.assertNotIn("user_agent", registro)
        self.assertEqual(registro["questao_titulo"], self.questao.titulo)
        self.assertEqual(registro["opcao_texto"], self.opcao.texto)

    def test_voto_rejeita_dupla_votacao_na_mesma_questao(self):
        Voto.objects.create(
            assembleia=self.assembleia,
            eleitor=self.eleitor,
            questao=self.questao,
            opcao_escolhida=self.opcao,
            metodo_auth=Voto.MetodoAuth.OTP,
            ip_address="0.0.0.0",
        )
        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(self.eleitor.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 409)

    def test_voto_rejeita_assembleia_fora_do_periodo(self):
        self.assembleia.data_inicio = timezone.now() + timedelta(hours=2)
        self.assembleia.data_fim = timezone.now() + timedelta(hours=4)
        self.assembleia.save(update_fields=["data_inicio", "data_fim"])
        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(self.eleitor.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("ainda não começou", response.data["error"])

    def test_verificar_voto_nao_expoe_dados(self):
        voto = Voto.objects.create(
            assembleia=self.assembleia,
            eleitor=self.eleitor,
            questao=self.questao,
            opcao_escolhida=self.opcao,
            metodo_auth=Voto.MetodoAuth.OTP,
            ip_address="0.0.0.0",
        )
        response = self.client.get(f"/api/votos/verificar/?hash={voto.hash_voto}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["encontrado"])
        # Confirma contexto sem revelar eleitor ou opção escolhida.
        corpo = json.dumps(response.data, default=str)
        self.assertNotIn(self.eleitor.nome, corpo)
        self.assertNotIn(self.opcao.texto, corpo)
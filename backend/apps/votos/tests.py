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
            votacao_liberada=True,
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

    def test_voto_duplo_mesma_questao_e_idempotente(self):
        # Retry no 4G / duplo-clique do MESMO eleitor na mesma questão: em vez
        # de erro (que assusta e leva a re-voto), devolve o 1º voto como sucesso
        # (ja_registrado) e NÃO cria um segundo voto — a apuração continua com 1.
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
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("ja_registrado"))
        self.assertEqual(
            Voto.objects.filter(
                eleitor=self.eleitor, questao=self.questao
            ).count(),
            1,
        )

    def test_voto_rejeitado_em_questao_encerrada(self):
        self.questao.encerrada = True
        self.questao.save(update_fields=["encerrada"])
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
        self.assertIn("encerrada", response.data["error"])

    def test_votos_permitidos_permite_segundo_voto(self):
        self.eleitor.votos_permitidos = 2
        self.eleitor.save(update_fields=["votos_permitidos"])
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
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            Voto.objects.filter(eleitor=self.eleitor, questao=self.questao).count(), 2
        )

    def test_voto_auto_inscreve_morador_do_condominio(self):
        # Link sem login: morador do condomínio que não estava na lista de
        # votantes é inscrito automaticamente ao votar (voto próprio).
        novo = Eleitor.objects.create(
            condominio=self.condominio,
            nome="Sem Lista",
            cpf_hash="d" * 64,
            bloco="D",
            apartamento="501",
            perfil="proprietario",
            email="semlista@example.com",
            cadastro_completo=True,
        )
        response = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(novo.id),
                "questao_id": str(self.questao.id),
                "opcao_id": str(self.opcao.id),
                "auth_token": self.build_auth_token(eleitor_id=novo.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(self.assembleia.votantes.filter(id=novo.id).exists())

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


class AssembleiaSemCadastroApuracaoTests(APITestCase):
    """O fluxo de "Criar assembleia": sem relação de moradores, cada um entra
    com selfie. Cinco unidades votam em duas perguntas; a apuração, a tela e os
    PDFs precisam contar igual."""

    VOTOS = [
        ("Ana Lima", "A", "101", "Sim", "Azul"),
        ("Bruno Castro", "A", "102", "Sim", "Verde"),
        ("Carla Dias", "B", "201", "Não", "Azul"),
        ("Diego Rocha", "B", "202", "Sim", "Azul"),
        ("Elisa Prado", "B", "203", "Abstenção", "Verde"),
    ]

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="demo-admin", email="demo@example.com", password="admin12345"
        )
        self.cond = Condominio.objects.create(
            nome="Residencial Demo", cnpj="SIMPLES-1", total_unidades=0
        )
        self.client.force_authenticate(self.admin)
        agora = timezone.now()
        r = self.client.post(
            "/api/assembleias/",
            {
                "condominio": str(self.cond.id),
                "titulo": "AGO Demo",
                "descricao": "",
                "data_inicio": (agora - timedelta(minutes=1)).isoformat(),
                "data_fim": (agora + timedelta(hours=4)).isoformat(),
                "quorum_minimo": 50,
                "primeira_chamada_50_mais_1": True,
                "quorum_segunda_chamada": 33,
                "segunda_chamada_qualquer_numero": True,
                "exigir_confirmacao_email": False,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assembleia = Assembleia.objects.get(id=r.data["id"])
        self.q1 = self._questao("Aprovação das contas", ["Sim", "Não", "Abstenção"], 1)
        self.q2 = self._questao("Cor da fachada", ["Azul", "Verde"], 2)
        self.client.force_authenticate(None)

    def _questao(self, titulo, opcoes, ordem):
        r = self.client.post(
            f"/api/assembleias/{self.assembleia.id}/questoes/",
            {
                "titulo": titulo,
                "descricao": "",
                "ordem": ordem,
                "opcoes_json": json.dumps(
                    [{"texto": t, "ordem": i + 1} for i, t in enumerate(opcoes)]
                ),
            },
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.data)
        questao = Questao.objects.get(id=r.data["id"])
        self.assertEqual(
            list(questao.opcoes.order_by("ordem").values_list("texto", flat=True)), opcoes
        )
        return questao

    def _entrar(self, nome, bloco, apto, aparelho):
        return self.client.post(
            f"/api/votos/{self.assembleia.id}/acesso-manual/",
            {
                "nome": nome,
                "bloco": bloco,
                "apartamento": apto,
                "selfie": "data:image/jpeg;base64,AAAA",
                "device_id": aparelho,
            },
            format="json",
        )

    def _votar(self, token, questao, texto, aparelho):
        return self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "questao_id": str(questao.id),
                "opcao_id": str(questao.opcoes.get(texto=texto).id),
                "auth_token": token,
                "device_id": aparelho,
            },
            format="json",
        )

    def _resultados(self):
        r = self.client.get(f"/api/votos/{self.assembleia.id}/resultados/")
        self.assertEqual(r.status_code, 200)
        return {q["questao_titulo"]: q for q in r.data}

    def _pdf(self, tipo):
        from apps.enquetes.tests import texto_pdf

        r = self.client.get(f"/api/assembleias/{self.assembleia.id}/relatorio-{tipo}-pdf/")
        self.assertEqual(r.status_code, 200)
        return texto_pdf(r.content)

    def test_cinco_votantes_apuracao_tela_e_pdfs(self):
        # Assembleia ainda fechada: ninguém entra.
        self.assertEqual(self._entrar("Apressado", "C", "301", "x").status_code, 400)
        self.client.force_authenticate(self.admin)
        r = self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.assertEqual(r.status_code, 200)
        self.client.force_authenticate(None)

        tokens = {}
        for i, (nome, bloco, apto, voto1, voto2) in enumerate(self.VOTOS):
            aparelho = f"aparelho-{i}"
            r = self._entrar(nome, bloco, apto, aparelho)
            self.assertEqual(r.status_code, 201, r.data)
            tokens[nome] = r.data["token"]
            self.assertEqual(self._votar(tokens[nome], self.q1, voto1, aparelho).status_code, 201)
            self.assertEqual(self._votar(tokens[nome], self.q2, voto2, aparelho).status_code, 201)

        # Duplo toque / reenvio: devolve o voto que já existia, sem trocar nada.
        r = self._votar(tokens["Ana Lima"], self.q1, "Não", "aparelho-0")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["ja_registrado"])
        # Outra pessoa da A-101 entra na assembleia, mas a unidade já votou.
        r = self._entrar("Fabio Lima", "A", "101", "aparelho-9")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self._votar(r.data["token"], self.q1, "Não", "aparelho-9").status_code, 409)
        self.assertEqual(Voto.objects.filter(assembleia=self.assembleia).count(), 10)

        self.client.force_authenticate(self.admin)
        res = self._resultados()
        contas, fachada = res["Aprovação das contas"], res["Cor da fachada"]
        self.assertEqual(
            {o["texto"]: o["votos"] for o in contas["opcoes"]},
            {"Sim": 3, "Não": 1, "Abstenção": 1},
        )
        self.assertEqual(
            {o["texto"]: o["votos"] for o in fachada["opcoes"]}, {"Azul": 3, "Verde": 2}
        )
        for q in (contas, fachada):
            self.assertEqual(q["total_votos"], 5)
            self.assertEqual(q["base_unidades"], 0)
            self.assertEqual(q["unidades_presentes"], 5)
            # A segunda pessoa da A-101 não vira abstenção.
            self.assertEqual(q["abstencoes"], 0)
            self.assertEqual(q["percentual_participacao"], 100.0)
            self.assertFalse(q["encerrada"])
        lista = self.client.get("/api/assembleias/").data["results"]
        self.assertEqual(lista[0]["total_votantes"], 6)

        presenca = self._pdf("presenca")
        self.assertIn("foi calculado porque", presenca)
        for nome, *_ in self.VOTOS:
            self.assertIn(nome, presenca)

        votacao = self._pdf("votacao")
        self.assertEqual(votacao.count("(Validado)"), 10)
        self.assertNotIn("Fabio", votacao)

        # Fechar a assembleia encerra os itens na tela e no PDF do resultado.
        r = self.client.post(f"/api/assembleias/{self.assembleia.id}/encerrar/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(q["encerrada"] for q in self._resultados().values()))
        resultado = self._pdf("resultado")
        self.assertEqual(resultado.count("Encerrada"), 2)
        self.assertNotIn("Em aberto", resultado)
        self.assertEqual(resultado.count(" 0 absten"), 2)
        self.assertEqual(resultado.count("vencedora"), 2)
        # Votar depois de fechar: recusado e nada muda.
        self.assertEqual(self._votar(tokens["Bruno Castro"], self.q1, "Não", "aparelho-1").status_code, 400)
        self.assertEqual(Voto.objects.filter(assembleia=self.assembleia).count(), 10)

        # Com o total de unidades informado, o quórum e a participação saem dele.
        self.cond.total_unidades = 10
        self.cond.save()
        q = self._resultados()["Aprovação das contas"]
        self.assertEqual((q["base_unidades"], q["percentual_participacao"]), (10, 50.0))
        detalhe = self.client.get(f"/api/assembleias/{self.assembleia.id}/").data
        self.assertEqual(detalhe["quorum"]["percentual"], 50.0)
        self.assertIn("50.0%", self._pdf("presenca"))

    def test_cadastro_na_hora_com_texto_longo_nao_derruba_a_entrada(self):
        # No Postgres o texto maior que a coluna dava erro 500 e o morador
        # ficava sem entrar ("Bloco A - Edifício Primavera" tem 28 letras).
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)
        r = self._entrar("M" * 250, "Bloco A - Edifício Primavera", "Apartamento 1201 fundos", "longo")
        self.assertEqual(r.status_code, 201, r.data)
        from apps.votos.models import VotanteManual

        votante = VotanteManual.objects.get(id=r.data["votante_manual_id"])
        self.assertEqual((len(votante.nome), len(votante.bloco), len(votante.apartamento)), (200, 20, 20))
        self.assertEqual(self._votar(r.data["token"], self.q1, "Sim", "longo").status_code, 201)

        # Campos obrigatórios continuam recusados.
        for nome, apto, selfie in (("", "101", True), ("Ana", "", True), ("Ana", "101", False)):
            r = self.client.post(
                f"/api/votos/{self.assembleia.id}/acesso-manual/",
                {"nome": nome, "bloco": "A", "apartamento": apto,
                 "selfie": "data:image/jpeg;base64,AAAA" if selfie else ""},
                format="json",
            )
            self.assertEqual(r.status_code, 400, (nome, apto, selfie))

    def test_sindico_de_outro_condominio_nao_ve_a_apuracao(self):
        from core.models import PerfilAdmin

        outro = Condominio.objects.create(nome="Outro", cnpj="SIMPLES-2", total_unidades=0)
        sindico = User.objects.create_user(username="sindico-outro", password="x", is_staff=True)
        PerfilAdmin.objects.create(user=sindico, role="sindico").condominios.add(outro)
        self.client.force_authenticate(sindico)
        self.assertEqual(
            self.client.get(f"/api/votos/{self.assembleia.id}/resultados/").status_code, 404
        )
        self.assertEqual(
            self.client.get(
                f"/api/assembleias/{self.assembleia.id}/relatorio-resultado-pdf/"
            ).status_code,
            404,
        )

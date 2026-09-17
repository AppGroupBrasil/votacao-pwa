import json
import re
from datetime import timedelta

from django.contrib.auth.models import User
from django.core import signing
from django.core.cache import cache
from django.test import override_settings
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


class BaseAssembleiaSemCadastro(APITestCase):
    """Assembleia do "Criar assembleia" (sem relação de moradores), com duas
    perguntas criadas pela API como a tela faz."""

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

    def _pdf_legivel(self, tipo):
        """Só as frases impressas no PDF, com os acentos de volta: o reportlab
        grava cada letra acentuada em octal dentro do fluxo da página."""
        trechos = re.findall(r"\(((?:[^()\\]|\\.)*)\)\s*Tj", self._pdf(tipo))
        frases = []
        for t in trechos:
            t = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), t)
            frases.append(t.replace("\\(", "(").replace("\\)", ")"))
        return " | ".join(frases)

class AssembleiaSemCadastroApuracaoTests(BaseAssembleiaSemCadastro):
    """Cinco unidades entram com selfie e votam em duas perguntas; a apuração,
    a tela e os PDFs precisam contar igual."""

    VOTOS = [
        ("Ana Lima", "A", "101", "Sim", "Azul"),
        ("Bruno Castro", "A", "102", "Sim", "Verde"),
        ("Carla Dias", "B", "201", "Não", "Azul"),
        ("Diego Rocha", "B", "202", "Sim", "Azul"),
        ("Elisa Prado", "B", "203", "Abstenção", "Verde"),
    ]

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


class ApuracaoCasosEspeciaisTests(BaseAssembleiaSemCadastro):
    """O que a simulação de 5 votantes não passou: empate, voto invalidado,
    unidade inadimplente, procuração e unidade declarada."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)

    def _entrar_e_votar(self, nome, apto, texto, aparelho):
        r = self._entrar(nome, "A", apto, aparelho)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self._votar(r.data["token"], self.q1, texto, aparelho).status_code, 201)
        return r.data

    def _contagem(self):
        q = self._resultados()["Aprovação das contas"]
        return {o["texto"]: o["votos"] for o in q["opcoes"]}

    def test_empate_nao_aponta_vencedora(self):
        self._entrar_e_votar("Ana", "101", "Sim", "a1")
        self._entrar_e_votar("Bia", "102", "Não", "a2")
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/encerrar/")
        self.assertEqual(self._contagem(), {"Sim": 1, "Não": 1, "Abstenção": 0})
        resultado = self._pdf("resultado")
        self.assertIn("Houve empate", resultado)
        # "vencedora" só aparece no aviso do empate, nunca numa opção.
        self.assertEqual(resultado.count("vencedora"), 1)

    def test_voto_invalidado_sai_da_contagem_e_aparece_no_relatorio(self):
        ana = self._entrar_e_votar("Ana", "101", "Sim", "a1")
        self._entrar_e_votar("Bia", "102", "Não", "a2")
        self.client.force_authenticate(self.admin)
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/votos-manuais/validar/",
            {"votante_manual_id": ana["votante_manual_id"], "acao": "rejeitar"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self._contagem(), {"Sim": 0, "Não": 1, "Abstenção": 0})
        votacao = self._pdf("votacao")
        self.assertEqual(votacao.count("(Rejeitado)"), 1)
        self.assertEqual(votacao.count("(Validado)"), 1)
        self.assertIn(r"1 voto\(s\) v", self._pdf("resultado"))

    def test_unidade_inadimplente_perde_o_voto_e_volta_ao_regularizar(self):
        ana = self._entrar_e_votar("Ana", "101", "Sim", "a1")
        self.client.force_authenticate(self.admin)
        url = f"/api/votos/{self.assembleia.id}/votos-manuais/validar/"
        r = self.client.post(
            url, {"votante_manual_id": ana["votante_manual_id"], "acao": "inadimplente"}, format="json"
        )
        self.assertEqual(r.data["votos_atualizados"], 1)
        self.assertEqual(self._contagem()["Sim"], 0)
        # A unidade não vota mais, nem na outra pergunta.
        self.client.force_authenticate(None)
        r = self._votar(ana["token"], self.q2, "Azul", "a1")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.data["code"], "inadimplente")
        # Regularizar devolve o voto à contagem.
        self.client.force_authenticate(self.admin)
        r = self.client.post(
            url, {"votante_manual_id": ana["votante_manual_id"], "acao": "regularizar"}, format="json"
        )
        self.assertEqual(r.data["votos_atualizados"], 1)
        self.assertEqual(self._contagem()["Sim"], 1)

    def _eleitor(self, nome, apto, **extra):
        e = Eleitor.objects.create(
            condominio=self.cond, nome=nome, bloco="B", apartamento=apto,
            email=f"{apto}@exemplo.com", **extra,
        )
        self.assembleia.votantes.add(e)
        return e

    def _token_eleitor(self, eleitor):
        return signing.dumps(
            {"eleitor_id": str(eleitor.id), "assembleia_id": str(self.assembleia.id), "method": "otp"},
            salt="vote-auth",
        )

    def _voto_eleitor(self, eleitor, texto, **extra):
        return self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {
                "eleitor_id": str(extra.pop("eleitor_id", eleitor.id)),
                "questao_id": str(self.q1.id),
                "opcao_id": str(self.q1.opcoes.get(texto=texto).id),
                "auth_token": self._token_eleitor(eleitor),
                **extra,
            },
            format="json",
        )

    def test_procuracao_so_conta_depois_de_aprovada(self):
        procurador = self._eleitor("Procurador", "301")
        representado = self._eleitor("Representado", "302")
        self.assertEqual(self._voto_eleitor(procurador, "Sim").status_code, 201)
        r = self._voto_eleitor(procurador, "Não", eleitor_id=representado.id, por_procuracao=True)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Voto.objects.get(eleitor=representado).status, Voto.Status.PENDENTE)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._contagem(), {"Sim": 1, "Não": 0, "Abstenção": 0})
        self.assertEqual(self._resultados()["Aprovação das contas"]["procuracoes_pendentes"], 1)
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/procuracoes/validar/",
            {"eleitor_id": str(representado.id), "acao": "aprovar"},
            format="json",
        )
        self.assertEqual(r.data["votos_atualizados"], 1)
        self.assertEqual(self._contagem(), {"Sim": 1, "Não": 1, "Abstenção": 0})
        # Eleitor inadimplente da planilha não vota.
        devedor = self._eleitor("Devedor", "303", inadimplente=True)
        self.client.force_authenticate(None)
        r = self._voto_eleitor(devedor, "Sim")
        self.assertEqual((r.status_code, r.data["code"]), (403, "inadimplente"))

    def test_unidade_declarada_fica_pendente_e_nao_repete(self):
        # update(): a instância do teste ainda está em rascunho; save() fecharia
        # a assembleia aberta pela API.
        Assembleia.objects.filter(id=self.assembleia.id).update(modo_multiplas_unidades="morador")
        dono = self._eleitor("Dono", "401")
        self.assertEqual(self._voto_eleitor(dono, "Sim").status_code, 201)
        declarada = {
            "unidade_declarada": True, "decl_bloco": "C", "decl_apartamento": "501",
            "decl_nome": "Dono", "grupo_declaracao": "6f1c7d3e-1111-4222-8333-444455556666",
        }
        r = self._voto_eleitor(dono, "Não", **declarada)
        self.assertEqual(r.status_code, 201, r.data)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self._contagem()["Não"], 0)
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/procuracoes/validar/",
            {"grupo_declaracao": declarada["grupo_declaracao"], "acao": "aprovar"},
            format="json",
        )
        self.assertEqual(r.data["votos_atualizados"], 1)
        self.assertEqual(self._contagem(), {"Sim": 1, "Não": 1, "Abstenção": 0})
        # A mesma unidade declarada de novo (outro grupo) é recusada.
        self.client.force_authenticate(None)
        r = self._voto_eleitor(
            dono, "Sim", **{**declarada, "grupo_declaracao": "7f1c7d3e-1111-4222-8333-444455556666"}
        )
        self.assertEqual(r.status_code, 409)
        # A própria unidade não pode ser declarada.
        r = self._voto_eleitor(
            dono, "Sim", **{**declarada, "decl_bloco": "B", "decl_apartamento": "401",
                             "grupo_declaracao": "8f1c7d3e-1111-4222-8333-444455556666"}
        )
        self.assertEqual(r.status_code, 400)


class IpDoMoradorTests(BaseAssembleiaSemCadastro):
    """Atrás da Cloudflare o primeiro item do X-Forwarded-For é o IP da
    Cloudflare; o do morador vem no CF-Connecting-IP."""

    def test_voto_e_presenca_gravam_o_ip_do_morador(self):
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)
        cabecalhos = {"HTTP_CF_CONNECTING_IP": "200.100.50.25", "HTTP_X_FORWARDED_FOR": "172.69.39.130"}
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/acesso-manual/",
            {"nome": "Ana", "bloco": "A", "apartamento": "101",
             "selfie": "data:image/jpeg;base64,AAAA", "device_id": "x"},
            format="json",
            **cabecalhos,
        )
        self.assertEqual(r.status_code, 201)
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/votar/",
            {"questao_id": str(self.q1.id), "opcao_id": str(self.q1.opcoes.first().id),
             "auth_token": r.data["token"], "device_id": "x"},
            format="json",
            **cabecalhos,
        )
        self.assertEqual(r.status_code, 201)
        from apps.assembleias.models import Presenca
        from apps.votos.models import VotanteManual

        self.assertEqual(Voto.objects.get().ip_address, "200.100.50.25")
        self.assertEqual(VotanteManual.objects.get().ip_address, "200.100.50.25")
        self.assertEqual(Presenca.objects.get().ip_address, "200.100.50.25")


class CpfNaEntradaTests(BaseAssembleiaSemCadastro):
    """CPF opcional na entrada com selfie: em branco entra igual; informado,
    fica só o hash e a máscara, no votante, na presença, no painel e no PDF."""

    HASH = "a" * 64
    MASCARA = "***.456.789-**"

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)

    def _entrar_cpf(self, nome, aparelho, **cpf):
        return self.client.post(
            f"/api/votos/{self.assembleia.id}/acesso-manual/",
            {"nome": nome, "bloco": "A", "apartamento": "101",
             "selfie": "data:image/jpeg;base64,AAAA", "device_id": aparelho, **cpf},
            format="json",
        )

    def test_sem_cpf_entra_normalmente(self):
        from apps.assembleias.models import Presenca
        from apps.votos.models import VotanteManual

        r = self._entrar("Ana", "A", "101", "x")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(VotanteManual.objects.get().cpf_mascarado, "")
        self.assertEqual(Presenca.objects.get().cpf_mascarado, "")

    def test_cpf_informado_fica_mascarado_no_votante_presenca_painel_e_pdf(self):
        from apps.assembleias.models import Presenca
        from apps.assembleias.relatorios_pdf import pdf_lista_presenca
        from apps.votos.models import VotanteManual

        r = self._entrar_cpf("Ana", "x", cpf_hash=self.HASH, cpf_mascarado=self.MASCARA)
        self.assertEqual(r.status_code, 201, r.data)
        v = VotanteManual.objects.get()
        self.assertEqual((v.cpf_hash, v.cpf_mascarado), (self.HASH, self.MASCARA))
        self.assertEqual(Presenca.objects.get().cpf_mascarado, self.MASCARA)

        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/votos/{self.assembleia.id}/votos-manuais/")
        self.assertEqual(r.data["votantes"][0]["cpf_mascarado"], self.MASCARA)
        self.assertNotIn("cpf_hash", r.data["votantes"][0])
        self.assertTrue(pdf_lista_presenca(self.assembleia))

    def test_numero_aberto_ou_par_incompleto_nao_e_guardado(self):
        from apps.votos.models import VotanteManual

        for i, cpf in enumerate([
            {"cpf_mascarado": "123.456.789-00", "cpf_hash": self.HASH},
            {"cpf_mascarado": self.MASCARA},
            {"cpf_hash": self.HASH},
        ]):
            r = self._entrar_cpf(f"Pessoa {i}", f"ap{i}", **cpf)
            self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(
            set(VotanteManual.objects.values_list("cpf_hash", "cpf_mascarado")), {("", "")}
        )

    def test_mesmo_cpf_e_unidade_com_nome_escrito_diferente_e_a_mesma_pessoa(self):
        from apps.assembleias.models import Presenca
        from apps.votos.models import VotanteManual

        cpf = {"cpf_hash": self.HASH, "cpf_mascarado": self.MASCARA}
        a = self._entrar_cpf("Ana Souza", "cel-1", **cpf)
        b = self._entrar_cpf("Ana S. Lima", "cel-2", **cpf)
        self.assertEqual(a.data["votante_manual_id"], b.data["votante_manual_id"])
        self.assertEqual(VotanteManual.objects.count(), 1)
        self.assertEqual(Presenca.objects.count(), 1)

    def test_cpf_informado_na_reentrada_completa_votante_e_presenca(self):
        from apps.assembleias.models import Presenca
        from apps.votos.models import VotanteManual

        self._entrar_cpf("Ana", "x")
        self._entrar_cpf("Ana", "x", cpf_hash=self.HASH, cpf_mascarado=self.MASCARA)
        self.assertEqual(VotanteManual.objects.get().cpf_mascarado, self.MASCARA)
        self.assertEqual(Presenca.objects.get().cpf_mascarado, self.MASCARA)

    def test_selfie_obrigatoria_sem_falar_em_votacao_manual(self):
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/acesso-manual/",
            {"nome": "Ana", "apartamento": "101"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("manual", r.data["error"].lower())


class ResultadoAoVivoTests(BaseAssembleiaSemCadastro):
    """Resultado ao vivo para quem não é do painel: só sai com a chave do
    síndico ligada e nunca diz quem votou em quê."""

    def setUp(self):
        super().setUp()
        # O placar fica guardado por segundos; cada teste começa sem sobra do
        # anterior (e sem sobra do ratelimit, que usa o mesmo cache).
        cache.clear()
        self.addCleanup(cache.clear)
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/").status_code,
            200,
        )
        self.client.force_authenticate(None)
        for i, (nome, bloco, apto, voto1, voto2) in enumerate(
            [
                ("Ana Lima", "A", "101", "Sim", "Azul"),
                ("Bruno Castro", "A", "102", "Sim", "Verde"),
                ("Carla Dias", "B", "201", "Não", "Azul"),
            ]
        ):
            aparelho = f"vivo-{i}"
            r = self._entrar(nome, bloco, apto, aparelho)
            self.assertEqual(r.status_code, 201, r.data)
            self._votar(r.data["token"], self.q1, voto1, aparelho)
            self._votar(r.data["token"], self.q2, voto2, aparelho)
        self.url = f"/api/votos/{self.assembleia.id}/resultado-publico/"

    def _ligar_chave(self, ligada=True):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(
            f"/api/assembleias/{self.assembleia.id}/",
            {"resultado_publico": ligada},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIs(r.data["resultado_publico"], ligada)
        self.client.force_authenticate(None)

    def test_chave_desligada_nao_devolve_contagem(self):
        # Nasce desligada: o morador não recebe número nenhum.
        self.assertFalse(Assembleia.objects.get(id=self.assembleia.id).resultado_publico)
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["liberado"])
        self.assertNotIn("questoes", r.data)
        self.assertNotIn("Sim", json.dumps(r.data))

    def test_chave_ligada_mostra_placar_sem_dizer_quem_votou(self):
        self._ligar_chave()
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["liberado"])
        questoes = {q["questao_titulo"]: q for q in r.data["questoes"]}
        self.assertEqual(
            {o["texto"]: o["votos"] for o in questoes["Aprovação das contas"]["opcoes"]},
            {"Sim": 2, "Não": 1, "Abstenção": 0},
        )
        self.assertEqual(
            {o["texto"]: o["votos"] for o in questoes["Cor da fachada"]["opcoes"]},
            {"Azul": 2, "Verde": 1},
        )
        for questao in r.data["questoes"]:
            for opcao in questao["opcoes"]:
                self.assertNotIn("votantes", opcao)
        # Só nomes e unidades: números soltos ("101") não servem de prova,
        # porque aparecem por acaso dentro dos UUIDs das opções.
        corpo = json.dumps(r.data)
        for pedaco in ("Ana Lima", "Bruno Castro", "Carla Dias", "A-101", '"votantes"'):
            self.assertNotIn(pedaco, corpo)
        for questao in r.data["questoes"]:
            for opcao in questao["opcoes"]:
                self.assertEqual(set(opcao), {"id", "texto", "votos"})

    def test_placar_do_morador_bate_com_o_do_painel(self):
        self._ligar_chave()
        publico = {
            q["questao_titulo"]: q for q in self.client.get(self.url).data["questoes"]
        }
        self.client.force_authenticate(self.admin)
        painel = self._resultados()
        self.client.force_authenticate(None)
        for titulo, q in painel.items():
            self.assertEqual(publico[titulo]["total_votos"], q["total_votos"])
            self.assertEqual(publico[titulo]["abstencoes"], q["abstencoes"])
            self.assertEqual(
                {o["texto"]: o["votos"] for o in publico[titulo]["opcoes"]},
                {o["texto"]: o["votos"] for o in q["opcoes"]},
            )

    @override_settings(RESULTADO_PUBLICO_CACHE_SEGUNDOS=0)
    def test_voto_novo_aparece_no_placar_ao_vivo(self):
        self._ligar_chave()
        antes = self.client.get(self.url).data["questoes"][0]["total_votos"]
        r = self._entrar("Diego Rocha", "B", "202", "vivo-9")
        self._votar(r.data["token"], self.q1, "Sim", "vivo-9")
        depois = self.client.get(self.url).data["questoes"][0]["total_votos"]
        self.assertEqual(depois, antes + 1)

    def test_desligar_a_chave_fecha_o_placar_de_novo(self):
        # Desligar vale na hora: o cache guarda a contagem, nunca a liberação.
        self._ligar_chave()
        self.assertTrue(self.client.get(self.url).data["liberado"])
        self._ligar_chave(False)
        r = self.client.get(self.url)
        self.assertFalse(r.data["liberado"])
        self.assertNotIn("questoes", r.data)

    def test_resposta_nao_fica_guardada_fora_do_servidor(self):
        # Sem isto a Cloudflare poderia servir o placar depois de desligado.
        self._ligar_chave()
        self.assertEqual(self.client.get(self.url)["Cache-Control"], "no-store")
        self._ligar_chave(False)
        self.assertEqual(self.client.get(self.url)["Cache-Control"], "no-store")

    def test_placar_guardado_no_cache_continua_sem_nomes(self):
        self._ligar_chave()
        self.client.get(self.url)  # primeira leitura guarda a apuração
        corpo = json.dumps(self.client.get(self.url).data)  # segunda vem do cache
        for nome in ("Ana Lima", "Bruno Castro", "Carla Dias", '"votantes"'):
            self.assertNotIn(nome, corpo)

    def test_quem_nao_e_do_painel_nao_abre_o_resultado_com_nomes(self):
        self._ligar_chave()
        r = self.client.get(f"/api/votos/{self.assembleia.id}/resultados/")
        self.assertIn(r.status_code, (401, 403))

    def test_so_o_painel_liga_a_chave(self):
        from core.models import PerfilAdmin

        # Anônimo não liga.
        r = self.client.patch(
            f"/api/assembleias/{self.assembleia.id}/",
            {"resultado_publico": True},
            format="json",
        )
        self.assertIn(r.status_code, (401, 403))
        # Síndico de outro condomínio também não.
        outro = Condominio.objects.create(
            nome="Outro Vivo", cnpj="SIMPLES-9", total_unidades=0
        )
        sindico = User.objects.create_user(
            username="sindico-vivo", password="x", is_staff=True
        )
        PerfilAdmin.objects.create(user=sindico, role="sindico").condominios.add(outro)
        self.client.force_authenticate(sindico)
        r = self.client.patch(
            f"/api/assembleias/{self.assembleia.id}/",
            {"resultado_publico": True},
            format="json",
        )
        self.assertIn(r.status_code, (403, 404))
        self.client.force_authenticate(None)
        self.assertFalse(Assembleia.objects.get(id=self.assembleia.id).resultado_publico)


class RelatorioTodasAsOpcoesTests(BaseAssembleiaSemCadastro):
    """O relatório precisa mostrar a votação inteira: as opções escolhidas e as
    que ninguém escolheu, mais o resumo final item a item."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)
        # Duas unidades votam "Sim" na questão 1. "Não" e "Abstenção" ficam
        # zeradas, e a questão 2 fica sem nenhum voto.
        for i, (nome, bloco, apto) in enumerate(
            [("Ana Lima", "A", "101"), ("Bruno Castro", "A", "102")]
        ):
            r = self._entrar(nome, bloco, apto, f"opcoes-{i}")
            self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(
                self._votar(r.data["token"], self.q1, "Sim", f"opcoes-{i}").status_code, 201
            )
        self.client.force_authenticate(self.admin)

    def test_resultado_mostra_opcao_com_zero_voto(self):
        texto = self._pdf_legivel("resultado")
        # As três opções da pergunta aparecem, com quem não teve voto zerado.
        for opcao in ("Sim", "Não", "Abstenção"):
            self.assertIn(opcao, texto)
        self.assertIn("2 | 100.0%", texto)  # Sim
        self.assertIn("0 | 0.0%", texto)  # Não e Abstenção
        # A pergunta sem nenhum voto também sai, com as opções dela.
        self.assertIn("Cor da fachada", texto)
        self.assertIn("Azul", texto)
        self.assertIn("Verde", texto)

    def test_resultado_traz_resumo_final_item_a_item(self):
        texto = self._pdf_legivel("resultado")
        self.assertIn("Resumo final", texto)
        self.assertIn("Vencedora: Sim", texto)
        self.assertIn("Sem votos", texto)  # a questão 2, sem voto nenhum
        # Cada opção com a quantidade e o percentual, inclusive as zeradas.
        for pedaco in (
            "Sim 2 (100.0%)",
            "Não 0 (0.0%)",
            "Abstenção 0 (0.0%)",
            "Azul 0 (0.0%)",
        ):
            self.assertIn(pedaco, texto)

    def test_votacao_lista_pergunta_sem_nenhum_voto(self):
        texto = self._pdf_legivel("votacao")
        self.assertIn("Cor da fachada", texto)
        self.assertIn("Nenhum voto registrado nesta pergunta.", texto)


class FichaDoParticipanteTests(BaseAssembleiaSemCadastro):
    """A lista de presença tem de provar quem entrou: foto, aparelho, IP e o
    resto do que foi gravado na identificação."""

    def _selfie(self):
        import base64
        import io as _io

        from PIL import Image as PilImage

        buf = _io.BytesIO()
        PilImage.new("RGB", (24, 24), (180, 40, 40)).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/assembleias/{self.assembleia.id}/abrir/")
        self.client.force_authenticate(None)
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/acesso-manual/",
            {
                "nome": "Ana Lima",
                "bloco": "A",
                "apartamento": "101",
                # O CPF nunca viaja inteiro: o aparelho manda o hash e a máscara.
                "cpf_hash": "b" * 64,
                "cpf_mascarado": "***.533.447-**",
                "selfie": self._selfie(),
                "device_id": "ficha-1",
            },
            format="json",
            HTTP_USER_AGENT=(
                "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
            ),
            HTTP_X_FORWARDED_FOR="203.0.113.77",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.client.force_authenticate(self.admin)

    def test_lista_de_presenca_traz_ficha_com_foto_e_dados_do_aparelho(self):
        bruto = self.client.get(
            f"/api/assembleias/{self.assembleia.id}/relatorio-presenca-pdf/"
        )
        self.assertEqual(bruto.status_code, 200)
        self.assertIn(b"/Image", bruto.content)  # a foto entrou no arquivo

        texto = self._pdf_legivel("presenca")
        self.assertIn("Ficha de cada participante", texto)
        self.assertIn("Ana Lima", texto)
        for rotulo in (
            "Endereço de IP",
            "Aparelho",
            "Sistema e navegador",
            "Navegador (completo)",
            "Localização",
            "Consentimento LGPD",
            "Declaração de veracidade",
            "Código do rosto",
            "Registro",
        ):
            self.assertIn(rotulo, texto)
        self.assertIn("203.0.113.77", texto)  # IP de quem registrou
        self.assertIn("Android", texto)  # aparelho lido do navegador
        self.assertIn("***.533.447-**", texto)  # CPF continua mascarado

    def test_ficha_nao_quebra_quando_a_foto_nao_abre(self):
        # Selfie inválida (foto corrompida no envio): a lista sai assim mesmo.
        from apps.assembleias.models import Presenca

        Presenca.objects.filter(assembleia=self.assembleia).update(
            selfie="data:image/jpeg;base64,AAAA"
        )
        texto = self._pdf_legivel("presenca")
        self.assertIn("Sem foto", texto)
        self.assertIn("Ana Lima", texto)

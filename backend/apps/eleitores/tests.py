import random
from datetime import timedelta

from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor, IdentidadeFacial
from core.models import PerfilAdmin


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


def _rosto(semente):
    """Vetor facial sintético: pessoas diferentes ficam a ~1,4 de distância,
    como no modelo real."""
    rnd = random.Random(semente)
    return [rnd.gauss(0, 0.09) for _ in range(128)]


def _variacao(vetor, semente, desvio=0.008):
    """Outra leitura da mesma pessoa (~0,1 de distância)."""
    rnd = random.Random(semente)
    return [x + rnd.gauss(0, desvio) for x in vetor]


def _deslocado(vetor, distancia):
    """Leitura exatamente a `distancia` do vetor, para testar os limiares."""
    return [vetor[0] + distancia, *vetor[1:]]


class LimiaresFaciaisTests(APITestCase):
    def test_confirmacao_um_contra_um_aceita_ate_050(self):
        from apps.eleitores import facial

        base = _rosto(1)
        ident = IdentidadeFacial(descriptor=base, descriptors=[base])
        self.assertTrue(facial.verificar(_deslocado(base, 0.48), ident)[0])
        self.assertFalse(facial.verificar(_deslocado(base, 0.52), ident)[0])

    def test_busca_exige_040_e_folga_sobre_o_segundo(self):
        from apps.eleitores import facial

        a, b = _rosto(1), _rosto(2)
        ia = IdentidadeFacial(descriptor=a, descriptors=[a])
        ib = IdentidadeFacial(descriptor=b, descriptors=[b])
        achado, _ = facial.melhor_correspondencia(_deslocado(a, 0.38), [ia, ib])
        self.assertIs(achado, ia)
        achado, _ = facial.melhor_correspondencia(_deslocado(a, 0.42), [ia, ib])
        self.assertIsNone(achado)
        # Dois cadastros quase iguais: não escolhe nenhum.
        quase_a = _deslocado(a, 0.05)
        ic = IdentidadeFacial(descriptor=quase_a, descriptors=[quase_a])
        achado, _ = facial.melhor_correspondencia(_deslocado(a, 0.2), [ia, ic])
        self.assertIsNone(achado)


class CadastroFacialAntecipadoTests(APITestCase):
    def setUp(self):
        cache.clear()  # o limite por IP vale entre testes no cache em memória
        self.condominio = Condominio.objects.create(
            nome="Residencial Delta", cnpj="33.444.555/0001-66", total_unidades=100
        )
        self.outro_condominio = Condominio.objects.create(
            nome="Residencial Vizinho", cnpj="77.888.999/0001-00", total_unidades=10
        )
        self.cpf_maria = "1" * 64
        self.cpf_joao = "2" * 64
        Eleitor.objects.create(
            condominio=self.condominio,
            nome="Maria Souza",
            cpf_hash=self.cpf_maria,
            bloco="A",
            apartamento="101",
            email="maria@delta.com",
        )
        Eleitor.objects.create(
            condominio=self.condominio,
            nome="João Lima",
            cpf_hash=self.cpf_joao,
            bloco="B",
            apartamento="202",
            email="joao@delta.com",
        )
        self.rosto_maria = _rosto(10)
        self.rosto_joao = _rosto(20)
        self.base = f"/api/eleitores/cadastro-facial/{self.condominio.id}/"

    def _leituras(self, rosto, n=5, semente=0):
        return [_variacao(rosto, semente + i) for i in range(n)]

    def _salvar(self, cpf_hash, leituras, **extra):
        dados = {
            "cpf_hash": cpf_hash,
            "descriptors": leituras,
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
            **extra,
        }
        return self.client.post(f"{self.base}salvar/", dados, format="json")

    def test_info_e_consulta_do_cpf(self):
        r = self.client.get(self.base)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["condominio_nome"], "Residencial Delta")
        self.assertIsNone(r.data["regra"])

        r = self.client.post(
            f"{self.base}consultar-cpf/", {"cpf_hash": self.cpf_maria}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["unidades"][0]["nome"], "Maria Souza")
        self.assertFalse(r.data["tem_rosto"])

        r = self.client.post(
            f"{self.base}consultar-cpf/", {"cpf_hash": "9" * 64}, format="json"
        )
        self.assertFalse(r.data["encontrado"])
        self.assertTrue(r.data["mensagem"])

    def test_fora_da_planilha_cadastra_com_a_unidade_declarada(self):
        # Maria é do Delta: pelo link do vizinho ela não está na planilha e só
        # entra declarando a unidade — e nada do Delta vaza para lá.
        url = f"/api/eleitores/cadastro-facial/{self.outro_condominio.id}/salvar/"
        dados = {
            "cpf_hash": self.cpf_maria,
            "descriptors": self._leituras(self.rosto_maria),
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
        }
        r = self.client.post(url, dados, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(IdentidadeFacial.objects.exists())

        r = self.client.post(
            url,
            {**dados, "nome": "Maria Procuradora", "apartamento": "7", "perfil": "procurador"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        ident = IdentidadeFacial.objects.get()
        self.assertEqual(ident.condominio, self.outro_condominio)
        self.assertEqual(ident.nome, "Maria Procuradora")
        self.assertEqual(ident.perfil, "procurador")

    def test_cadastra_rosto_com_dados_da_planilha(self):
        r = self._salvar(self.cpf_maria, self._leituras(self.rosto_maria))
        self.assertEqual(r.status_code, 201, r.data)
        ident = IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria)
        self.assertEqual(ident.nome, "Maria Souza")
        self.assertEqual(ident.apartamento, "101")
        self.assertEqual(len(ident.descriptors), 5)
        self.assertIsNotNone(ident.cadastro_antecipado_em)
        self.assertFalse(ident.suspeita_duplicidade)

        r = self.client.post(
            f"{self.base}consultar-cpf/", {"cpf_hash": self.cpf_maria}, format="json"
        )
        self.assertTrue(r.data["tem_rosto"])

    def test_recusa_sem_lgpd_sem_foto_fora_da_planilha_e_leitura_oscilando(self):
        leituras = self._leituras(self.rosto_maria)
        self.assertEqual(
            self._salvar(self.cpf_maria, leituras, consentimento_lgpd=False).status_code, 400
        )
        self.assertEqual(self._salvar(self.cpf_maria, leituras, selfie="").status_code, 400)
        self.assertEqual(self._salvar("9" * 64, leituras).status_code, 400)
        self.assertEqual(self._salvar(self.cpf_maria, leituras[:2]).status_code, 400)
        # Duas pessoas se revezando na frente da câmera.
        misturadas = self._leituras(self.rosto_maria, 2) + self._leituras(self.rosto_joao, 2)
        self.assertEqual(self._salvar(self.cpf_maria, misturadas).status_code, 400)
        self.assertFalse(IdentidadeFacial.objects.exists())

    def test_leitura_tremida_e_descartada_sem_recusar(self):
        leituras = self._leituras(self.rosto_maria, 4) + [self.rosto_joao]
        r = self._salvar(self.cpf_maria, leituras)
        self.assertEqual(r.status_code, 201, r.data)
        ident = IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria)
        self.assertEqual(len(ident.descriptors), 4)
        self.assertNotIn(self.rosto_joao, ident.descriptors)

    def test_cpf_com_rosto_de_outra_pessoa_nao_e_sobrescrito(self):
        self._salvar(self.cpf_maria, self._leituras(self.rosto_maria))
        antes = IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria).descriptors

        r = self._salvar(self.cpf_maria, self._leituras(self.rosto_joao))
        self.assertEqual(r.status_code, 409)
        self.assertEqual(
            IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria).descriptors, antes
        )

        # A própria Maria refazendo: atualiza.
        r = self._salvar(self.cpf_maria, self._leituras(self.rosto_maria, semente=50))
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotEqual(
            IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria).descriptors, antes
        )
        self.assertEqual(IdentidadeFacial.objects.count(), 1)

    def test_mesmo_rosto_em_dois_cpfs_sai_com_selo_ate_a_mesa_conferir(self):
        from apps.assembleias.models import Assembleia
        from apps.votos.models import VotanteManual

        self._salvar(self.cpf_maria, self._leituras(self.rosto_maria))
        # Maria cadastra o próprio rosto também no CPF do João.
        r = self._salvar(self.cpf_joao, self._leituras(self.rosto_maria, semente=30))
        self.assertEqual(r.status_code, 201, r.data)
        joao = IdentidadeFacial.objects.get(cpf_hash=self.cpf_joao)
        self.assertTrue(joao.suspeita_duplicidade)
        self.assertFalse(
            IdentidadeFacial.objects.get(cpf_hash=self.cpf_maria).suspeita_duplicidade
        )

        agora = timezone.now()
        assembleia = Assembleia.objects.create(
            condominio=self.condominio,
            titulo="AGO",
            data_inicio=agora - timedelta(hours=1),
            data_fim=agora + timedelta(hours=2),
            status=Assembleia.Status.ABERTA,
        )
        leitura = _variacao(self.rosto_maria, 99)
        r = self.client.post(
            f"/api/votos/{assembleia.id}/acesso-facial/",
            {
                "cpf_hash": self.cpf_joao,
                "descriptor": leitura,
                "descriptors": [leitura],
                "nome": "João Lima",
                "bloco": "B",
                "apartamento": "202",
                "selfie": "data:image/jpeg;base64,AAAA",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        votante = VotanteManual.objects.get(assembleia=assembleia)
        self.assertTrue(votante.conferir_na_mesa)
        self.assertEqual(votante.motivo_conferencia, "rosto_duplicado")

        admin = User.objects.create_superuser(
            username="mesa", email="mesa@delta.com", password="x"
        )
        self.client.force_authenticate(admin)
        r = self.client.post(
            f"/api/votos/{assembleia.id}/votos-manuais/validar/",
            {"votante_manual_id": str(votante.id), "acao": "conferir"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        joao.refresh_from_db()
        self.assertFalse(joao.suspeita_duplicidade)

    def test_rosto_antecipado_confirma_na_lista_de_presenca(self):
        from apps.enquetes.models import ListaPresenca, PresencaManual

        self._salvar(self.cpf_maria, self._leituras(self.rosto_maria))
        lista = ListaPresenca.objects.create(condominio=self.condominio, titulo="AGO")
        url = f"/api/enquetes/listas-presenca/{lista.id}/facial/registrar/"
        dados = {
            "cpf_hash": self.cpf_maria,
            "nome": "Maria Souza",
            "bloco": "A",
            "apartamento": "101",
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
        }
        leitura = _variacao(self.rosto_maria, 77)
        r = self.client.post(
            url, {**dados, "descriptor": leitura, "descriptors": [leitura]}, format="json"
        )
        self.assertIn(r.status_code, (200, 201), r.data)
        registro = PresencaManual.objects.get(lista=lista)
        self.assertFalse(registro.conferir_na_mesa)

        # Outra pessoa com o CPF da Maria não passa limpa.
        lista2 = ListaPresenca.objects.create(condominio=self.condominio, titulo="AGE")
        outro = _variacao(self.rosto_joao, 5)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista2.id}/facial/registrar/",
            {**dados, "descriptor": outro, "descriptors": [outro]},
            format="json",
        )
        self.assertIn(r.status_code, (200, 201), r.data)
        registro = PresencaManual.objects.get(lista=lista2)
        self.assertTrue(registro.conferir_na_mesa)
        self.assertEqual(registro.motivo_conferencia, "rosto_nao_confere")

    def test_limite_por_ip_responde_429_com_mensagem(self):
        # O limite fica por fora do DRF: sem isso sairia 403 genérico e o
        # morador não leria o "aguarde".
        for _ in range(60):
            self.client.post(f"{self.base}salvar/", {}, format="json")
        r = self.client.post(f"{self.base}salvar/", {}, format="json")
        self.assertEqual(r.status_code, 429)
        self.assertIn("Aguarde", r.json()["error"])

    def test_sem_cpf_nome_e_unidade_de_quem_tem_rosto_nao_entra_limpo(self):
        from apps.assembleias.models import Assembleia
        from apps.enquetes.models import ListaPresenca, PresencaManual
        from apps.votos.models import VotanteManual

        # Condomínio sem planilha: a entrada é pelo rosto, sem CPF.
        cond = self.outro_condominio
        IdentidadeFacial.objects.create(
            condominio=cond,
            nome="Carlos Dias",
            apartamento="10",
            descriptor=self.rosto_joao,
            descriptors=[self.rosto_joao],
        )
        agora = timezone.now()
        assembleia = Assembleia.objects.create(
            condominio=cond,
            titulo="AGO",
            data_inicio=agora - timedelta(hours=1),
            data_fim=agora + timedelta(hours=2),
            status=Assembleia.Status.ABERTA,
        )
        impostor = _variacao(self.rosto_maria, 3)
        dados = {
            "descriptor": impostor,
            "descriptors": [impostor],
            "nome": "Carlos Dias",
            "bloco": "",
            "apartamento": "10",
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
        }
        r = self.client.post(
            f"/api/votos/{assembleia.id}/acesso-facial/", dados, format="json"
        )
        self.assertEqual(r.status_code, 200, r.data)
        votante = VotanteManual.objects.get(assembleia=assembleia)
        self.assertTrue(votante.conferir_na_mesa)
        self.assertEqual(votante.motivo_conferencia, "rosto_nao_confere")

        lista = ListaPresenca.objects.create(condominio=cond, titulo="AGO")
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/facial/registrar/",
            dados,
            format="json",
        )
        self.assertIn(r.status_code, (200, 201), r.data)
        registro = PresencaManual.objects.get(lista=lista)
        self.assertTrue(registro.conferir_na_mesa)
        self.assertEqual(registro.motivo_conferencia, "rosto_nao_confere")
        self.assertEqual(IdentidadeFacial.objects.filter(condominio=cond).count(), 1)

        # O próprio Carlos é achado pelo rosto e entra sem selo.
        lista2 = ListaPresenca.objects.create(condominio=cond, titulo="AGE")
        proprio = _variacao(self.rosto_joao, 4)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista2.id}/facial/registrar/",
            {**dados, "descriptor": proprio, "descriptors": [proprio]},
            format="json",
        )
        self.assertIn(r.status_code, (200, 201), r.data)
        self.assertFalse(PresencaManual.objects.get(lista=lista2).conferir_na_mesa)

    def test_resumo_da_biometria_so_para_o_sindico_do_condominio(self):
        self._salvar(self.cpf_maria, self._leituras(self.rosto_maria))
        url = f"/api/condominios/{self.condominio.id}/biometria-resumo/"

        self.assertIn(self.client.get(url).status_code, (401, 403))

        sindico_vizinho = User.objects.create_user(
            username="vizinho", password="x", is_staff=True
        )
        PerfilAdmin.objects.create(user=sindico_vizinho, role="sindico").condominios.add(
            self.outro_condominio
        )
        self.client.force_authenticate(sindico_vizinho)
        self.assertEqual(self.client.get(url).status_code, 404)

        sindico = User.objects.create_user(username="sindico", password="x", is_staff=True)
        PerfilAdmin.objects.create(user=sindico, role="sindico").condominios.add(
            self.condominio
        )
        self.client.force_authenticate(sindico)
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r.data, {"moradores_com_cpf": 2, "com_rosto": 1, "antecipados": 1}
        )


class RegraCadastroAntecipadoTests(APITestCase):
    """Assembleia com "somente cadastro antecipado": o cadastro fecha X horas
    antes do início e, depois disso, só entra quem já tem o rosto guardado."""

    def setUp(self):
        from apps.assembleias.models import Assembleia
        from apps.enquetes.models import ListaPresenca

        cache.clear()
        self.cond = Condominio.objects.create(
            nome="Residencial Épsilon", cnpj="44.555.666/0001-77", total_unidades=50
        )
        self.cpf_ana = "3" * 64  # cadastrou antes
        self.cpf_bia = "4" * 64  # não cadastrou
        for cpf, nome, apto in ((self.cpf_ana, "Ana", "11"), (self.cpf_bia, "Bia", "12")):
            Eleitor.objects.create(
                condominio=self.cond, nome=nome, cpf_hash=cpf, apartamento=apto,
                email=f"{nome.lower()}@e.com",
            )
        self.rosto_ana = _rosto(40)
        self.rosto_bia = _rosto(41)
        IdentidadeFacial.objects.create(
            condominio=self.cond, cpf_hash=self.cpf_ana, nome="Ana", apartamento="11",
            descriptor=self.rosto_ana, descriptors=[self.rosto_ana],
        )
        agora = timezone.now()
        # Começa em 3h, cadastro fecha 6h antes: já está fechado.
        self.assembleia = Assembleia.objects.create(
            condominio=self.cond,
            titulo="AGE Fachada",
            data_inicio=agora + timedelta(hours=3),
            data_fim=agora + timedelta(hours=6),
            status=Assembleia.Status.ABERTA,
            somente_cadastro_antecipado=True,
            cadastro_antecedencia_horas=6,
        )
        self.lista = ListaPresenca.objects.create(condominio=self.cond, titulo="AGE")

    def _entrada(self, cpf, rosto, nome, apto):
        leitura = _variacao(rosto, 9)
        return {
            "cpf_hash": cpf,
            "descriptor": leitura,
            "descriptors": [leitura],
            "nome": nome,
            "bloco": "",
            "apartamento": apto,
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
        }

    def test_com_prazo_vencido_so_entra_quem_cadastrou_antes(self):
        a = self.assembleia.id
        r = self.client.post(f"/api/votos/{a}/consultar-cpf/", {"cpf_hash": self.cpf_bia}, format="json")
        self.assertTrue(r.data["cadastro_fechado"])
        self.assertIn("fechou", r.data["mensagem_cadastro"])
        r = self.client.post(f"/api/votos/{a}/consultar-cpf/", {"cpf_hash": self.cpf_ana}, format="json")
        self.assertFalse(r.data["cadastro_fechado"])

        r = self.client.post(
            f"/api/votos/{a}/acesso-facial/",
            self._entrada(self.cpf_bia, self.rosto_bia, "Bia", "12"),
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.data["cadastro_fechado"])
        self.assertFalse(IdentidadeFacial.objects.filter(cpf_hash=self.cpf_bia).exists())

        r = self.client.post(
            f"/api/votos/{a}/acesso-facial/",
            self._entrada(self.cpf_ana, self.rosto_ana, "Ana", "11"),
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["encontrado"])

        # Sem CPF, rosto desconhecido: não abre cadastro na hora.
        sem_cpf = self._entrada("", self.rosto_bia, "", "")
        sem_cpf.pop("cpf_hash")
        r = self.client.post(f"/api/votos/{a}/acesso-facial/", sem_cpf, format="json")
        self.assertEqual(r.status_code, 403)

        r = self.client.post(
            f"/api/votos/{a}/acesso-manual/",
            {"nome": "Bia", "apartamento": "12", "selfie": "data:image/jpeg;base64,AAAA"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

        r = self.client.post(
            f"/api/eleitores/cadastro-facial/{self.cond.id}/salvar/",
            {
                "cpf_hash": self.cpf_bia,
                "descriptors": [_variacao(self.rosto_bia, i) for i in range(5)],
                "selfie": "data:image/jpeg;base64,AAAA",
                "consentimento_lgpd": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        self.assertFalse(IdentidadeFacial.objects.filter(cpf_hash=self.cpf_bia).exists())

    def test_lista_de_presenca_segue_a_regra_e_a_lista_rapida_nao(self):
        from apps.enquetes.models import ListaPresenca

        base = f"/api/enquetes/listas-presenca/{self.lista.id}"
        r = self.client.get(f"{base}/publica/")
        self.assertTrue(r.data["regra_cadastro"]["fechado"])

        r = self.client.post(f"{base}/consultar-cpf/", {"cpf_hash": self.cpf_bia}, format="json")
        self.assertTrue(r.data["cadastro_fechado"])

        entrada_bia = {**self._entrada(self.cpf_bia, self.rosto_bia, "Bia", "12"), "assinatura": "x"}
        r = self.client.post(f"{base}/facial/registrar/", entrada_bia, format="json")
        self.assertEqual(r.status_code, 403)

        entrada_ana = {**self._entrada(self.cpf_ana, self.rosto_ana, "Ana", "11"), "assinatura": "x"}
        r = self.client.post(f"{base}/facial/registrar/", entrada_ana, format="json")
        self.assertIn(r.status_code, (200, 201), r.data)

        manual = {
            "nome": "Bia", "apartamento": "12", "selfie": "data:image/jpeg;base64,AAAA",
            "assinatura": "data:image/png;base64,AAAA", "consentimento_lgpd": True,
            "declaracao_veracidade": True,
        }
        r = self.client.post(f"{base}/registrar/", manual, format="json")
        self.assertEqual(r.status_code, 403)

        rapida = ListaPresenca.objects.create(condominio=self.cond, titulo="Reunião", modo_rapido=True)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{rapida.id}/registrar/", manual, format="json"
        )
        self.assertNotEqual(r.status_code, 403, r.data)

    def test_antes_do_prazo_cadastra_e_depois_do_fim_reabre(self):
        from apps.assembleias.models import Assembleia

        agora = timezone.now()
        self.assembleia.data_inicio = agora + timedelta(hours=30)
        self.assembleia.data_fim = agora + timedelta(hours=33)
        self.assembleia.cadastro_antecedencia_horas = 24
        self.assembleia.save()
        info = self.client.get(f"/api/eleitores/cadastro-facial/{self.cond.id}/").data
        self.assertFalse(info["regra"]["fechado"])
        self.assertEqual(info["regra"]["assembleia_titulo"], "AGE Fachada")

        salvar = {
            "cpf_hash": self.cpf_bia,
            "descriptors": [_variacao(self.rosto_bia, i) for i in range(5)],
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
        }
        r = self.client.post(
            f"/api/eleitores/cadastro-facial/{self.cond.id}/salvar/", salvar, format="json"
        )
        self.assertEqual(r.status_code, 201, r.data)

        # Encerrada no painel: a regra deixa de valer.
        self.assembleia.data_inicio = agora - timedelta(hours=1)
        self.assembleia.status = Assembleia.Status.ENCERRADA
        self.assembleia.save()
        self.assertIsNone(
            self.client.get(f"/api/eleitores/cadastro-facial/{self.cond.id}/").data["regra"]
        )

    def test_sindico_configura_e_prazo_tem_limite(self):
        sindico = User.objects.create_user(username="sind-e", password="x", is_staff=True)
        PerfilAdmin.objects.create(user=sindico, role="sindico").condominios.add(self.cond)
        self.client.force_authenticate(sindico)
        url = f"/api/assembleias/{self.assembleia.id}/"
        r = self.client.patch(url, {"cadastro_antecedencia_horas": 2}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["cadastro_antecedencia_horas"], 2)
        self.assertTrue(r.data["somente_cadastro_antecipado"])
        self.assertIsNotNone(r.data["prazo_cadastro"])
        for invalido in (0, 500):
            r = self.client.patch(url, {"cadastro_antecedencia_horas": invalido}, format="json")
            self.assertEqual(r.status_code, 400)

        # Com 2h de antecedência e início em 3h, o cadastro reabriu.
        r = self.client.post(
            f"/api/votos/{self.assembleia.id}/consultar-cpf/",
            {"cpf_hash": self.cpf_bia},
            format="json",
        )
        self.assertFalse(r.data["cadastro_fechado"])

    def test_rosto_guardado_antes_do_cpf_ganha_o_cpf_em_vez_de_duplicar(self):
        # Como em produção: cadastros antigos feitos sem CPF.
        antigo = IdentidadeFacial.objects.create(
            condominio=self.cond, nome="Bia (sem CPF)", apartamento="12",
            descriptor=self.rosto_bia, descriptors=[self.rosto_bia],
        )
        a = self.assembleia.id
        # Com rostos antigos no condomínio, a consulta do CPF não bloqueia: só a
        # foto diz se é um deles.
        r = self.client.post(f"/api/votos/{a}/consultar-cpf/", {"cpf_hash": self.cpf_bia}, format="json")
        self.assertFalse(r.data["cadastro_fechado"])

        estranho = _rosto(77)
        r = self.client.post(
            f"/api/votos/{a}/acesso-facial/",
            self._entrada(self.cpf_bia, estranho, "Bia", "12"),
            format="json",
        )
        self.assertEqual(r.status_code, 403)

        r = self.client.post(
            f"/api/votos/{a}/acesso-facial/",
            self._entrada(self.cpf_bia, self.rosto_bia, "Bia", "12"),
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        antigo.refresh_from_db()
        self.assertEqual(antigo.cpf_hash, self.cpf_bia)
        self.assertEqual(IdentidadeFacial.objects.filter(condominio=self.cond).count(), 2)

    def test_condominio_sem_cpf_na_planilha_cadastra_como_proprietario(self):
        from apps.assembleias.models import Assembleia

        Assembleia.objects.filter(id=self.assembleia.id).update(
            data_inicio=timezone.now() + timedelta(days=3),
            data_fim=timezone.now() + timedelta(days=3, hours=4),
        )
        cond = Condominio.objects.create(nome="Sem CPF", cnpj="55.555.555/0001-55", total_unidades=500)
        Eleitor.objects.create(condominio=cond, nome="Morador", apartamento="1", email="m@s.com")
        rosto = _rosto(90)
        antigo = IdentidadeFacial.objects.create(
            condominio=cond, nome="Dona Rosa", apartamento="33",
            descriptor=rosto, descriptors=[rosto],
        )
        base = f"/api/eleitores/cadastro-facial/{cond.id}"
        self.assertFalse(self.client.get(f"{base}/").data["tem_planilha"])
        r = self.client.post(f"{base}/consultar-cpf/", {"cpf_hash": "6" * 64}, format="json")
        self.assertFalse(r.data["tem_planilha"])
        self.assertNotIn("planilha", r.data["mensagem"])

        salvar = {
            "cpf_hash": "6" * 64,
            "descriptors": [_variacao(rosto, i) for i in range(5)],
            "selfie": "data:image/jpeg;base64,AAAA",
            "consentimento_lgpd": True,
            "nome": "Rosa Lima",
            "apartamento": "33",
        }
        r = self.client.post(f"{base}/salvar/", salvar, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        antigo.refresh_from_db()
        self.assertEqual(antigo.cpf_hash, "6" * 64)
        self.assertEqual(antigo.perfil, "proprietario")
        self.assertIsNotNone(antigo.cadastro_antecipado_em)
        self.assertEqual(IdentidadeFacial.objects.filter(condominio=cond).count(), 1)

        # Rosto novo no mesmo condomínio: cadastro novo, também proprietário.
        r = self.client.post(
            f"{base}/salvar/",
            {**salvar, "cpf_hash": "7" * 64, "descriptors": [_variacao(_rosto(91), i) for i in range(5)]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(IdentidadeFacial.objects.get(cpf_hash="7" * 64).perfil, "proprietario")

    def test_lista_de_cadastros_para_conferir(self):
        Eleitor.objects.filter(cpf_hash=self.cpf_ana).update(inadimplente=True)
        IdentidadeFacial.objects.create(
            condominio=self.cond, cpf_hash="5" * 64, nome="Carla Procuradora",
            apartamento="12", perfil="procurador",
            descriptor=self.rosto_bia, descriptors=[self.rosto_bia], selfie="data:image/jpeg;base64,FOTO",
        )
        url = f"/api/condominios/{self.cond.id}/cadastros-faciais/"
        self.assertIn(self.client.get(url).status_code, (401, 403))

        vizinho_cond = Condominio.objects.create(nome="Viz", cnpj="1", total_unidades=1)
        vizinho = User.objects.create_user(username="viz-e", password="x", is_staff=True)
        PerfilAdmin.objects.create(user=vizinho, role="sindico").condominios.add(vizinho_cond)
        self.client.force_authenticate(vizinho)
        self.assertEqual(self.client.get(url).status_code, 404)

        sindico = User.objects.create_user(username="sind-l", password="x", is_staff=True)
        PerfilAdmin.objects.create(user=sindico, role="sindico").condominios.add(self.cond)
        self.client.force_authenticate(sindico)
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        por_nome = {c["nome"]: c for c in r.data["cadastros"]}
        self.assertTrue(por_nome["Ana"]["na_planilha"])
        self.assertTrue(por_nome["Ana"]["inadimplente"])
        self.assertFalse(por_nome["Carla Procuradora"]["na_planilha"])
        self.assertEqual(por_nome["Carla Procuradora"]["perfil"], "procurador")
        self.assertNotIn("selfie", por_nome["Ana"])

        carla = por_nome["Carla Procuradora"]["id"]
        r = self.client.get(f"{url}{carla}/foto/")
        self.assertEqual(r.data["selfie"], "data:image/jpeg;base64,FOTO")
        self.client.force_authenticate(vizinho)
        self.assertEqual(self.client.get(f"{url}{carla}/foto/").status_code, 404)
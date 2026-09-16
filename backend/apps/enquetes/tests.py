import base64
import hashlib
import io
import re
import zlib

from django.contrib.auth.models import User
from django.core import signing
from rest_framework.test import APITestCase

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor, IdentidadeFacial
from core.models import PerfilAdmin

from .models import ListaPresenca, PresencaManual

FOTO = "data:image/jpeg;base64,AAAA"
ASSINATURA = "data:image/png;base64,AAAA"
CPF_ANA = "529.982.247-25"
MASCARA_ANA = "***.982.247-**"


def hash_cpf(cpf):
    return hashlib.sha256("".join(c for c in cpf if c.isdigit()).encode()).hexdigest()


def imagem(formato, largura=80, altura=60):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (largura, altura), (200, 150, 120)).save(buf, formato)
    tipo = "jpeg" if formato == "JPEG" else "png"
    return f"data:image/{tipo};base64," + base64.b64encode(buf.getvalue()).decode()


def texto_pdf(conteudo):
    """Texto das páginas do PDF (o reportlab grava cada página em ASCII85 +
    Flate)."""
    partes = []
    for bloco in re.findall(rb"stream\r?\n(.*?)endstream", conteudo, re.S):
        try:
            if bloco.rstrip().endswith(b"~>"):
                bloco = base64.a85decode(bloco.rstrip()[:-2])
            partes.append(zlib.decompress(bloco).decode("latin-1"))
        except (ValueError, zlib.error):
            continue
    return "".join(partes)


class BaseListaPresenca(APITestCase):
    def setUp(self):
        self.cond = Condominio.objects.create(
            nome="Residencial Ipê", cnpj="11.111.111/0001-11", total_unidades=10
        )
        self.sindico = User.objects.create_user(
            username="sindico@ipe.com", password="123456", is_staff=True
        )
        PerfilAdmin.objects.create(user=self.sindico, role="sindico").condominios.add(self.cond)

    def criar_lista(self, **extra):
        self.client.force_authenticate(self.sindico)
        r = self.client.post(
            "/api/enquetes/listas-presenca/",
            {"titulo": "AGO", "nome_condominio": self.cond.nome, **extra},
            format="json",
        )
        self.client.force_authenticate(None)
        self.assertEqual(r.status_code, 201, r.data)
        return ListaPresenca.objects.get(id=r.data["id"])

    def entrada_manual(self, **extra):
        return {
            "nome": "Ana Souza",
            "bloco": "A",
            "apartamento": "101",
            "cpf_hash": hash_cpf(CPF_ANA),
            "cpf_mascarado": MASCARA_ANA,
            "observacao": "Sou procuradora do 102. Paguei o condomínio hoje.",
            "selfie": FOTO,
            "assinatura": ASSINATURA,
            "metodo_auth": "selfie",
            "consentimento_lgpd": True,
            "declaracao_veracidade": True,
            **extra,
        }


class ListaPresencaModosTests(BaseListaPresenca):
    """Quem cria a lista escolhe o modo: biometria facial ou manual (selfie,
    nome, CPF, bloco, apartamento, observação e assinatura). Nos dois o CPF e a
    observação ficam no registro; o CPF só com a máscara."""

    def test_a_lista_nasce_no_modo_escolhido_e_as_duas_aparecem_na_tela(self):
        manual = self.criar_lista(modo_rapido=True)
        biometria = self.criar_lista(modo_rapido=False)
        self.assertTrue(manual.modo_rapido)
        self.assertFalse(biometria.modo_rapido)
        self.assertEqual(manual.condominio_id, self.cond.id)

        self.client.force_authenticate(self.sindico)
        r = self.client.get("/api/enquetes/listas-presenca/")
        ids = {item["id"] for item in r.data["results"]}
        self.assertEqual(ids, {str(manual.id), str(biometria.id)})

        r = self.client.get(f"/api/enquetes/listas-presenca/{manual.id}/publica/")
        self.assertTrue(r.data["modo_rapido"])
        self.assertFalse(r.data["tem_cpf"])

    def test_lista_manual_guarda_cpf_mascarado_e_observacao(self):
        lista = self.criar_lista(modo_rapido=True)
        url = f"/api/enquetes/listas-presenca/{lista.id}/registrar/"

        r = self.client.post(url, self.entrada_manual(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        reg = PresencaManual.objects.get(lista=lista)
        self.assertEqual(reg.cpf_hash, hash_cpf(CPF_ANA))
        self.assertEqual(reg.cpf_mascarado, MASCARA_ANA)
        self.assertEqual(reg.observacao, "Sou procuradora do 102. Paguei o condomínio hoje.")
        self.assertFalse(reg.conferir_na_mesa)

        # A mesa vê a máscara e a observação; o hash não sai da API.
        self.client.force_authenticate(self.sindico)
        r = self.client.get(f"/api/enquetes/listas-presenca/{lista.id}/registros/")
        self.assertEqual(r.data[0]["cpf_mascarado"], MASCARA_ANA)
        self.assertEqual(r.data[0]["observacao"], reg.observacao)
        self.assertNotIn("cpf_hash", r.data[0])
        self.assertNotIn("52998224725", str(r.data))

    def test_lista_manual_recusa_entrada_sem_cpf_valido(self):
        lista = self.criar_lista(modo_rapido=True)
        url = f"/api/enquetes/listas-presenca/{lista.id}/registrar/"
        recusas = [
            self.entrada_manual(cpf_hash="", cpf_mascarado=""),
            # Sem a máscara a mesa não teria o que conferir.
            self.entrada_manual(cpf_mascarado=""),
            # CPF inteiro no lugar da máscara não é guardado.
            self.entrada_manual(cpf_mascarado=CPF_ANA),
            self.entrada_manual(cpf_hash="123"),
        ]
        for entrada in recusas:
            r = self.client.post(url, entrada, format="json")
            self.assertEqual(r.status_code, 400, entrada)
            self.assertEqual(r.data["error"], "Informe o seu CPF.")
        self.assertFalse(PresencaManual.objects.filter(lista=lista).exists())

        # A lista manual continua sem biometria, nem por caminho torto.
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/facial/registrar/",
            self.entrada_manual(),
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertFalse(PresencaManual.objects.filter(lista=lista).exists())

    def test_cnpj_mascarado_e_observacao_cortada_em_500(self):
        lista = self.criar_lista(modo_rapido=True)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/registrar/",
            self.entrada_manual(
                cpf_hash=hash_cpf("11.222.333/0001-81"),
                cpf_mascarado="**.222.333/0001-**",
                observacao="x" * 900,
            ),
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        reg = PresencaManual.objects.get(lista=lista)
        self.assertEqual(reg.cpf_mascarado, "**.222.333/0001-**")
        self.assertEqual(len(reg.observacao), 500)

    def test_biometria_sem_planilha_guarda_o_cpf_sem_mudar_a_identificacao(self):
        lista = self.criar_lista(modo_rapido=False)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/facial/registrar/",
            {
                "cpf_digitado_hash": hash_cpf(CPF_ANA),
                "cpf_mascarado": MASCARA_ANA,
                "observacao": "Cheguei atrasada.",
                "nome": "Ana Souza",
                "bloco": "A",
                "apartamento": "101",
                "selfie": FOTO,
                "assinatura": ASSINATURA,
                "consentimento_lgpd": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        # Sem planilha não há o que conferir: o CPF digitado não acende o selo.
        self.assertFalse(r.data["conferir_na_mesa"])
        reg = PresencaManual.objects.get(lista=lista)
        self.assertEqual(reg.cpf_mascarado, MASCARA_ANA)
        self.assertEqual(reg.cpf_hash, hash_cpf(CPF_ANA))
        self.assertEqual(reg.observacao, "Cheguei atrasada.")
        # O cadastro do rosto segue como antes, sem CPF.
        self.assertEqual(reg.identidade.cpf_hash, "")

    def test_biometria_com_planilha_guarda_o_cpf_do_portao(self):
        Eleitor.objects.create(
            condominio=self.cond, nome="Ana Souza", cpf_hash=hash_cpf(CPF_ANA),
            bloco="A", apartamento="101",
        )
        lista = self.criar_lista(modo_rapido=False)
        r = self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/facial/registrar/",
            {
                "cpf_hash": hash_cpf(CPF_ANA),
                "cpf_mascarado": MASCARA_ANA,
                "observacao": "Proprietária.",
                "nome": "Ana Souza",
                "bloco": "A",
                "apartamento": "101",
                "selfie": FOTO,
                "assinatura": ASSINATURA,
                "consentimento_lgpd": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.data)
        reg = PresencaManual.objects.get(lista=lista)
        self.assertEqual(reg.cpf_mascarado, MASCARA_ANA)
        self.assertEqual(reg.observacao, "Proprietária.")
        self.assertEqual(
            IdentidadeFacial.objects.get(condominio=self.cond).cpf_hash, hash_cpf(CPF_ANA)
        )

    def test_sindico_de_outro_condominio_nao_ve_os_registros(self):
        lista = self.criar_lista(modo_rapido=True)
        self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/registrar/",
            self.entrada_manual(),
            format="json",
        )
        vizinho = Condominio.objects.create(
            nome="Residencial Jatobá", cnpj="22.222.222/0001-22", total_unidades=5
        )
        outro = User.objects.create_user(
            username="sindico@jatoba.com", password="123456", is_staff=True
        )
        PerfilAdmin.objects.create(user=outro, role="sindico").condominios.add(vizinho)
        self.client.force_authenticate(outro)
        r = self.client.get(f"/api/enquetes/listas-presenca/{lista.id}/registros/")
        self.assertEqual(r.status_code, 404)
        r = self.client.get("/api/enquetes/listas-presenca/")
        self.assertEqual(r.data["results"], [])

        self.client.force_authenticate(None)
        r = self.client.get(f"/api/enquetes/listas-presenca/{lista.id}/registros/")
        self.assertIn(r.status_code, (401, 403))


class ComprovantePresencaTests(BaseListaPresenca):
    """No lugar de "Registrar outra pessoa": o comprovante em PDF de quem acabou
    de registrar, e a trava que impede o mesmo CPF de entrar duas vezes na
    mesma unidade."""

    def registrar(self, lista, **extra):
        return self.client.post(
            f"/api/enquetes/listas-presenca/{lista.id}/registrar/",
            self.entrada_manual(**extra),
            format="json",
        )

    def test_mesmo_cpf_na_mesma_unidade_nao_registra_de_novo(self):
        lista = self.criar_lista(modo_rapido=True)
        r = self.registrar(lista, device_id="aparelho-1")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertFalse(r.data["ja_presente"])
        self.assertTrue(r.data["comprovante"]["token"])

        # Mesma unidade escrita de outro jeito, mesmo aparelho: já presente, e o
        # aparelho que registrou recebe o comprovante de volta.
        r = self.registrar(lista, device_id="aparelho-1", bloco="a", apartamento="Apto 101")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["ja_presente"])
        self.assertTrue(r.data["comprovante"]["token"])

        # Outro aparelho com o CPF e a unidade dela: não entra e não leva nada.
        r = self.registrar(lista, device_id="aparelho-2", nome="Outra Pessoa")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["ja_presente"])
        self.assertIsNone(r.data["comprovante"])
        self.assertNotIn("selfie", r.data)
        self.assertEqual(PresencaManual.objects.filter(lista=lista).count(), 1)

        # Dono de outra unidade registra a outra; outra pessoa da unidade também.
        r = self.registrar(lista, device_id="aparelho-1", apartamento="102")
        self.assertEqual(r.status_code, 201, r.data)
        r = self.registrar(
            lista, device_id="aparelho-3", nome="Bruno Souza",
            cpf_hash=hash_cpf("111.444.777-35"), cpf_mascarado="***.444.777-**",
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(PresencaManual.objects.filter(lista=lista).count(), 3)

        # O mesmo CPF em outra lista é outra presença.
        outra = self.criar_lista(modo_rapido=True)
        self.assertEqual(self.registrar(outra, device_id="aparelho-1").status_code, 201)

    def test_comprovante_em_pdf_com_os_dados_do_registro(self):
        lista = self.criar_lista(modo_rapido=True)
        r = self.registrar(
            lista,
            device_id="aparelho-1",
            selfie=imagem("JPEG", 480, 640),
            assinatura=imagem("PNG", 600, 200),
            marca_aparelho="Galaxy A15",
            geo_lat=-23.55052,
            geo_lng=-46.633308,
        )
        self.assertEqual(r.status_code, 201, r.data)
        comprovante = r.data["comprovante"]
        reg = PresencaManual.objects.get(lista=lista)
        self.assertEqual(comprovante["numero"], str(reg.id)[:8].upper())
        self.assertEqual(comprovante["ip"], "127.0.0.1")
        self.assertEqual(comprovante["cpf_mascarado"], MASCARA_ANA)

        # Sem login: o link assinado é a guarda.
        url = f"/api/enquetes/listas-presenca/comprovante/{comprovante['token']}/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertIn("no-store", r["Cache-Control"])
        self.assertTrue(r.content.startswith(b"%PDF"))
        texto = texto_pdf(r.content)
        for trecho in (
            "Ana Souza", MASCARA_ANA, "Galaxy A15", "aparelho-1", "127.0.0.1",
            "-23.550520, -46.633308", comprovante["numero"], "Paguei o condom",
        ):
            self.assertIn(trecho, texto)
        self.assertNotIn("52998224725", texto)
        # Foto e assinatura entram como imagens.
        self.assertEqual(len(re.findall(rb"/Subtype /Image", r.content)), 2)

    def test_comprovante_recusa_link_alterado_ou_de_registro_apagado(self):
        lista = self.criar_lista(modo_rapido=True)
        r = self.registrar(lista, device_id="aparelho-1")
        token = r.data["comprovante"]["token"]
        reg = PresencaManual.objects.get(lista=lista)
        base = "/api/enquetes/listas-presenca/comprovante"
        for falso in (
            token[:-1] + ("A" if token[-1] != "A" else "B"),
            "qualquer-coisa",
            # Token de outro uso do sistema, com o mesmo id dentro.
            signing.dumps(str(reg.id), salt="vote-auth"),
            signing.dumps(str(reg.id)),
        ):
            self.assertEqual(self.client.get(f"{base}/{falso}/").status_code, 404, falso)

        # Foto que não abre não derruba o comprovante.
        self.assertEqual(self.client.get(f"{base}/{token}/").status_code, 200)

        # A mesa excluiu o registro: o link para de funcionar.
        self.client.force_authenticate(self.sindico)
        self.client.delete(f"/api/enquetes/listas-presenca/{lista.id}/registros/{reg.id}/")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{base}/{token}/").status_code, 404)

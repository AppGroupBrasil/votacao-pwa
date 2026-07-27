import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from apps.condominios.models import Condominio


class Eleitor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="eleitores"
    )
    central_id = models.UUIDField(
        unique=True,
        blank=True,
        null=True,
        help_text="ID do morador na central (auth-central) — mapeia o sync de cadastro.",
    )
    nome = models.CharField(max_length=200)
    cpf_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        db_index=True,
        help_text="Hash SHA-256 do CPF/CNPJ. Não é único: uma pessoa pode ter várias unidades e a construtora repete o CNPJ.",
    )
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20)
    perfil = models.CharField(
        max_length=20,
        choices=[("proprietario", "Proprietário"), ("procurador", "Procurador")],
        default="proprietario",
    )
    email = models.EmailField(max_length=200, blank=True, default="")
    senha = models.CharField(max_length=128, blank=True, default="")
    senha_alterada = models.BooleanField(
        default=False,
        help_text="False obriga troca de senha no primeiro acesso.",
    )
    biometria_hash = models.CharField(max_length=64, blank=True, default="")
    webauthn_credential = models.JSONField(blank=True, null=True)
    cadastro_completo = models.BooleanField(default=False)
    bloqueado = models.BooleanField(
        default=False,
        help_text="Se True, o morador não pode autenticar nem votar.",
    )
    inadimplente = models.BooleanField(
        default=False,
        help_text="Inadimplência por unidade. Se True, o morador acessa mas não pode votar.",
    )
    votos_permitidos = models.PositiveSmallIntegerField(
        default=1,
        help_text="Quantidade de votos a que tem direito (uma unidade = 1). Aumente quando o morador possui mais de uma unidade.",
    )
    convite_token = models.CharField(max_length=64, unique=True, blank=True, null=True)
    convite_expira_em = models.DateTimeField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        verbose_name_plural = "eleitores"
        constraints = [
            models.UniqueConstraint(
                fields=["condominio", "bloco", "apartamento", "nome"],
                name="unique_eleitor_apartamento",
            )
        ]

    def set_senha(self, raw):
        self.senha = make_password(raw)

    def check_senha(self, raw):
        return bool(self.senha) and check_password(raw, self.senha)

    @property
    def tem_biometria(self):
        return bool(self.biometria_hash or self.webauthn_credential)

    def __str__(self):
        return f"{self.nome} - {self.apartamento}"


class IdentidadeFacial(models.Model):
    """Identidade facial permanente do morador, por condomínio.

    O vetor facial (descriptor de 128 posições do face-api) é o documento:
    a pessoa se cadastra uma vez e é reconhecida nas assembleias seguintes,
    de qualquer aparelho, sem precisar se cadastrar de novo."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="identidades_faciais"
    )
    nome = models.CharField(max_length=200)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20, blank=True, default="")
    perfil = models.CharField(max_length=20, blank=True, default="proprietario")
    descriptor = models.JSONField(
        help_text="Vetor facial 128-D (face-api). Base da comparação para reconhecer a pessoa."
    )
    selfie = models.TextField(
        blank=True, default="", help_text="Foto-comprovante capturada no cadastro."
    )
    consentimento_lgpd = models.BooleanField(default=False)
    consentimento_em = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    ultimo_visto_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        verbose_name = "Identidade facial"
        verbose_name_plural = "Identidades faciais"

    def __str__(self):
        return f"{self.nome} - {self.apartamento}"


class SolicitacaoExclusao(models.Model):
    """Pedido de exclusão de cadastro feito pelo morador (LGPD / Google Play).

    A página pública /excluir apenas registra o pedido; a remoção efetiva dos
    dados é feita pelo administrador/síndico após localizar a pessoa.
    """

    STATUS = [
        ("pendente", "Pendente"),
        ("concluida", "Concluída"),
        ("recusada", "Recusada"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=200)
    cpf = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="CPF informado pelo morador para localizar o cadastro.",
    )
    email = models.EmailField(max_length=200, blank=True, default="")
    condominio = models.CharField(max_length=200, blank=True, default="")
    motivo = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS, default="pendente")
    observacao_admin = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True)
    processada_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Solicitação de exclusão"
        verbose_name_plural = "Solicitações de exclusão"

    def __str__(self):
        return f"{self.nome} ({self.get_status_display()})"

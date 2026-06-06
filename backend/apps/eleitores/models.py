import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models

from apps.condominios.models import Condominio


class Eleitor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="eleitores"
    )
    nome = models.CharField(max_length=200)
    cpf_hash = models.CharField(max_length=64, unique=True, blank=True, null=True)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20)
    perfil = models.CharField(
        max_length=20,
        choices=[("proprietario", "Proprietário"), ("procurador", "Procurador")],
        default="proprietario",
    )
    email = models.EmailField(max_length=200)
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

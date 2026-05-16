import uuid

from django.db import models

from apps.condominios.models import Condominio


class Eleitor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="eleitores"
    )
    nome = models.CharField(max_length=200)
    cpf_hash = models.CharField(max_length=64, unique=True)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20)
    perfil = models.CharField(
        max_length=20,
        choices=[("proprietario", "Proprietário"), ("procurador", "Procurador")],
        default="proprietario",
    )
    email = models.EmailField(max_length=200)
    biometria_hash = models.CharField(max_length=64, blank=True, default="")
    webauthn_credential = models.JSONField(blank=True, null=True)
    cadastro_completo = models.BooleanField(default=False)
    convite_token = models.CharField(max_length=64, unique=True, blank=True, null=True)
    convite_expira_em = models.DateTimeField(blank=True, null=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        verbose_name_plural = "eleitores"
        constraints = [
            models.UniqueConstraint(
                fields=["condominio", "apartamento"],
                name="unique_eleitor_apartamento",
            )
        ]

    def __str__(self):
        return f"{self.nome} - {self.apartamento}"

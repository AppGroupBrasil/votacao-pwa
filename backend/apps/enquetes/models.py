import uuid

from django.db import models

from apps.condominios.models import Condominio


class Enquete(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio,
        on_delete=models.CASCADE,
        related_name="enquetes",
        null=True,
        blank=True,
    )
    titulo = models.CharField(max_length=255)
    ativa = models.BooleanField(default=True)
    voto_aberto = models.BooleanField(
        default=False,
        help_text="Se True, identifica quem votou (nome/unidade). Se False, anônimo.",
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Enquete"
        verbose_name_plural = "Enquetes"

    def __str__(self):
        return self.titulo


class EnqueteOpcao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enquete = models.ForeignKey(
        Enquete, on_delete=models.CASCADE, related_name="opcoes"
    )
    texto = models.CharField(max_length=255)
    ordem = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["ordem"]

    def __str__(self):
        return self.texto


class EnqueteVoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    enquete = models.ForeignKey(
        Enquete, on_delete=models.CASCADE, related_name="votos"
    )
    opcao = models.ForeignKey(
        EnqueteOpcao, on_delete=models.CASCADE, related_name="votos"
    )
    device_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    votante_nome = models.CharField(max_length=200, blank=True, default="")
    votante_bloco = models.CharField(max_length=20, blank=True, default="")
    votante_apartamento = models.CharField(max_length=20, blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["enquete", "device_id"],
                condition=~models.Q(device_id=""),
                name="unique_enquete_device",
            )
        ]

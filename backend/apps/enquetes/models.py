import uuid

from django.db import models

from apps.assembleias.models import Assembleia, gerar_codigo_curto
from apps.condominios.models import Condominio


class Enquete(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo_curto = models.CharField(
        max_length=8,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Código curto do link compartilhável: appvotacao.com.br/v/<codigo>.",
    )
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

    def save(self, *args, **kwargs):
        if not self.codigo_curto:
            for _ in range(20):
                codigo = gerar_codigo_curto()
                if (
                    not Enquete.objects.filter(codigo_curto=codigo).exists()
                    and not Assembleia.objects.filter(codigo_curto=codigo).exists()
                ):
                    self.codigo_curto = codigo
                    break
        super().save(*args, **kwargs)

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


class ListaPresenca(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio,
        on_delete=models.CASCADE,
        related_name="listas_presenca",
        null=True,
        blank=True,
    )
    titulo = models.CharField(max_length=255)
    ativa = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Lista de presença manual"
        verbose_name_plural = "Listas de presença manual"

    def __str__(self):
        return self.titulo


class PresencaManual(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lista = models.ForeignKey(
        ListaPresenca, on_delete=models.CASCADE, related_name="registros"
    )
    nome = models.CharField(max_length=200)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20, blank=True, default="")
    selfie = models.TextField(blank=True, default="")
    assinatura = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["criado_em"]

    def __str__(self):
        return self.nome


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

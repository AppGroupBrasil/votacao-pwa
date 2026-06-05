import uuid

from django.db import models


class Condominio(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=200)
    cnpj = models.CharField(max_length=18, unique=True)
    total_unidades = models.PositiveIntegerField()
    adimplente = models.BooleanField(
        default=True,
        help_text="Se False, bloqueia acesso do condomínio ao sistema",
    )
    blocos = models.JSONField(
        default=list,
        blank=True,
        help_text='Lista de blocos/torres, ex: ["A","B","C"] ou ["Torre 1","Torre 2"]',
    )
    autocadastro_ativo = models.BooleanField(
        default=False,
        help_text="Se True, moradores podem se autocadastrar pelo link público.",
    )
    autocadastro_token = models.CharField(
        max_length=64, unique=True, blank=True, null=True
    )
    whatsapp_administradora = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Número (com DDD) da administradora para contato dos inadimplentes.",
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nome"]
        verbose_name_plural = "condomínios"

    def __str__(self):
        return self.nome

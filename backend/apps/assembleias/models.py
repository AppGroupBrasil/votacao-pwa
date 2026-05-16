import uuid

from django.db import models

from apps.condominios.models import Condominio
from apps.eleitores.models import Eleitor


class Assembleia(models.Model):
    class Status(models.TextChoices):
        RASCUNHO = "rascunho", "Rascunho"
        ABERTA = "aberta", "Aberta"
        ENCERRADA = "encerrada", "Encerrada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="assembleias"
    )
    titulo = models.CharField(max_length=300)
    descricao = models.TextField(blank=True, default="")
    data_inicio = models.DateTimeField()
    data_fim = models.DateTimeField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.RASCUNHO
    )
    quorum_minimo = models.PositiveIntegerField(
        default=50, help_text="Percentual mínimo 1ª chamada"
    )
    primeira_chamada_50_mais_1 = models.BooleanField(
        default=True,
        help_text="Se True, 1ª chamada exige 50% + 1 (conforme lei)",
    )
    quorum_segunda_chamada = models.PositiveIntegerField(
        default=50, help_text="Percentual mínimo 2ª chamada"
    )
    segunda_chamada_qualquer_numero = models.BooleanField(
        default=False,
        help_text="Se True, 2ª chamada aceita qualquer número dos presentes",
    )
    votantes = models.ManyToManyField(Eleitor, blank=True, related_name="assembleias")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data_inicio"]
        verbose_name_plural = "assembleias"

    def __str__(self):
        return self.titulo


class Questao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.CASCADE, related_name="questoes"
    )
    titulo = models.CharField(max_length=500)
    descricao = models.TextField(blank=True, default="")
    ordem = models.PositiveIntegerField(default=0)
    imagem = models.ImageField(
        upload_to="questoes/imagens/", blank=True, null=True,
        help_text="Foto do candidato ou imagem ilustrativa",
    )
    arquivo = models.FileField(
        upload_to="questoes/arquivos/", blank=True, null=True,
        help_text="Documento para download (PDF, orçamento, etc.)",
    )
    link_externo = models.URLField(
        blank=True, default="",
        help_text="Link externo (vídeo, documento online, etc.)",
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["ordem"]
        verbose_name_plural = "questões"

    def __str__(self):
        return self.titulo


class OpcaoVoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    questao = models.ForeignKey(
        Questao, on_delete=models.CASCADE, related_name="opcoes"
    )
    texto = models.CharField(max_length=200)
    ordem = models.PositiveIntegerField(default=0)
    imagem = models.ImageField(
        upload_to="opcoes/imagens/", blank=True, null=True,
        help_text="Foto do candidato",
    )
    arquivo = models.FileField(
        upload_to="opcoes/arquivos/", blank=True, null=True,
        help_text="Documento do candidato (PDF, currículo, etc.)",
    )
    link_externo = models.URLField(
        blank=True, default="",
        help_text="Link externo (vídeo, perfil, etc.)",
    )

    class Meta:
        ordering = ["ordem"]
        verbose_name_plural = "opções de voto"


class Presenca(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.CASCADE, related_name="presencas"
    )
    eleitor = models.ForeignKey(
        Eleitor, on_delete=models.CASCADE, related_name="presencas"
    )
    nome = models.CharField(max_length=200)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20)
    perfil = models.CharField(
        max_length=20,
        choices=[("proprietario", "Proprietário"), ("procurador", "Procurador")],
        default="proprietario",
    )
    metodo_auth = models.CharField(max_length=20, default="webauthn")
    assinatura_facial = models.CharField(
        max_length=64, blank=True, default="",
        help_text="Hash SHA-256 do vetor facial capturado na autenticação",
    )
    horario_entrada = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["horario_entrada"]
        verbose_name_plural = "presenças"
        constraints = [
            models.UniqueConstraint(
                fields=["assembleia", "eleitor"],
                name="unique_presenca_eleitor_assembleia",
            )
        ]

    def __str__(self):
        return f"{self.nome} - {self.apartamento}"

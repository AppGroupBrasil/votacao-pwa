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
    votacao_liberada = models.BooleanField(
        default=False,
        help_text="Se False, a assembleia está aberta para presença mas os votos ficam travados até a liberação.",
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
    encerrada = models.BooleanField(
        default=False,
        help_text="Se True, a votação deste item foi encerrada e não aceita novos votos.",
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


class Ata(models.Model):
    """Resumo e ata da assembleia gerados a partir de uma gravação.

    Fluxo: link da gravação -> transcrição (manual ou IA) -> resumo/ata por IA
    -> ata editável e exportável (TXT/PDF).
    """

    class Status(models.TextChoices):
        PENDENTE = "pendente", "Pendente"
        TRANSCREVENDO = "transcrevendo", "Transcrevendo"
        TRANSCRITA = "transcrita", "Transcrita"
        GERANDO = "gerando", "Gerando ata"
        PRONTA = "pronta", "Pronta"
        ERRO = "erro", "Erro"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.OneToOneField(
        Assembleia, on_delete=models.CASCADE, related_name="ata"
    )
    link_gravacao = models.URLField(
        blank=True, default="",
        help_text="Link da gravação (YouTube, Drive, etc.) — origem da ata",
    )
    transcricao = models.TextField(
        blank=True, default="",
        help_text="Transcrição da gravação (colada manualmente ou via IA)",
    )
    resumo = models.TextField(blank=True, default="")
    ata_texto = models.TextField(
        blank=True, default="",
        help_text="Ata final, editável pelo síndico",
    )
    provedor_ia = models.CharField(
        max_length=20,
        choices=[("deepseek", "DeepSeek"), ("openai", "OpenAI Mini")],
        default="deepseek",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDENTE
    )
    erro_mensagem = models.CharField(max_length=500, blank=True, default="")
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "atas"

    def __str__(self):
        return f"Ata — {self.assembleia.titulo}"


class Presenca(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.CASCADE, related_name="presencas"
    )
    eleitor = models.ForeignKey(
        Eleitor,
        on_delete=models.CASCADE,
        related_name="presencas",
        null=True,
        blank=True,
        help_text="Vazio quando a presença é avulsa (morador sem cadastro)",
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
    ip_address = models.GenericIPAddressField(
        null=True, blank=True,
        help_text="IP de onde a presença foi registrada",
    )
    user_agent = models.TextField(blank=True, default="")
    device_info = models.CharField(
        max_length=255, blank=True, default="",
        help_text="Aparelho/navegador que registrou a presença",
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


class LogAuditoria(models.Model):
    class Acao(models.TextChoices):
        ABRIR = "abrir", "Abrir assembleia"
        ENCERRAR = "encerrar", "Encerrar assembleia"
        VALIDAR_PROCURACAO = "validar_procuracao", "Validar voto por procuração"
        REJEITAR_PROCURACAO = "rejeitar_procuracao", "Rejeitar voto por procuração"
        MARCAR_PRESENCA = "marcar_presenca", "Marcar presença"
        TRANSCREVER = "transcrever", "Transcrever gravação"
        GERAR_ATA = "gerar_ata", "Gerar ata"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.CASCADE, related_name="logs",
        null=True, blank=True,
    )
    condominio = models.ForeignKey(
        Condominio, on_delete=models.CASCADE, related_name="logs",
        null=True, blank=True,
    )
    acao = models.CharField(max_length=30, choices=Acao.choices)
    descricao = models.CharField(max_length=500, blank=True, default="")
    ator = models.CharField(max_length=255, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name_plural = "logs de auditoria"

    def __str__(self):
        return f"{self.get_acao_display()} — {self.criado_em:%d/%m/%Y %H:%M}"

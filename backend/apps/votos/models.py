import hashlib
import uuid

from django.db import models

from apps.assembleias.models import Assembleia, OpcaoVoto, Questao
from apps.eleitores.models import Eleitor


class VotanteManual(models.Model):
    """Morador sem cadastro (ou cujo e-mail não bate) que entra pela votação
    manual: informa nome/unidade e tira uma selfie de comprovação. O voto vale
    imediatamente; o síndico pode revisar/invalidar pela selfie depois."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.CASCADE, related_name="votantes_manuais"
    )
    nome = models.CharField(max_length=200)
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20)
    selfie = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    device_info = models.CharField(max_length=255, blank=True, default="")
    device_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    identidade_facial = models.ForeignKey(
        "eleitores.IdentidadeFacial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="votantes_manuais",
        help_text="Rosto reconhecido (quando entrou pela facial). Garante 1 voto por rosto.",
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["criado_em"]
        verbose_name_plural = "votantes manuais"
        constraints = [
            models.UniqueConstraint(
                fields=["assembleia", "identidade_facial"],
                condition=models.Q(identidade_facial__isnull=False),
                name="uniq_votante_facial_por_assembleia",
            )
        ]

    def __str__(self):
        return f"{self.nome} - {self.apartamento} (manual)"


class Voto(models.Model):
    class MetodoAuth(models.TextChoices):
        FACIAL = "facial", "Biometria Facial"
        SELFIE = "selfie", "Selfie"
        WEBAUTHN = "webauthn", "WebAuthn"
        OTP = "otp", "OTP"
        MANUAL = "manual", "Manual com selfie"

    class Status(models.TextChoices):
        VALIDADO = "validado", "Validado"
        PENDENTE = "pendente", "Pendente de validação"
        REJEITADO = "rejeitado", "Rejeitado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.PROTECT, related_name="votos"
    )
    eleitor = models.ForeignKey(
        Eleitor,
        on_delete=models.PROTECT,
        related_name="votos",
        null=True,
        blank=True,
        help_text="Vazio quando o voto é manual (votante_manual preenchido)",
    )
    votante_manual = models.ForeignKey(
        VotanteManual,
        on_delete=models.PROTECT,
        related_name="votos",
        null=True,
        blank=True,
    )
    questao = models.ForeignKey(
        Questao, on_delete=models.PROTECT, related_name="votos"
    )
    opcao_escolhida = models.ForeignKey(
        OpcaoVoto, on_delete=models.PROTECT, related_name="votos"
    )
    timestamp = models.DateTimeField(auto_now_add=True)
    metodo_auth = models.CharField(max_length=20, choices=MetodoAuth.choices)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default="")
    device_info = models.CharField(max_length=255, blank=True, default="")
    device_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    marca_aparelho = models.CharField(max_length=120, blank=True, default="")
    selfie = models.TextField(blank=True, default="")
    assinatura = models.TextField(blank=True, default="")
    modo_participacao = models.CharField(
        max_length=12,
        choices=[("presencial", "Presencial"), ("online", "Online")],
        default="presencial",
    )
    geo_lat = models.FloatField(null=True, blank=True)
    geo_lng = models.FloatField(null=True, blank=True)
    consentimento_lgpd = models.BooleanField(default=False)
    consentimento_em = models.DateTimeField(null=True, blank=True)
    declaracao_veracidade = models.BooleanField(default=False)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.VALIDADO,
        db_index=True,
    )
    por_procuracao = models.BooleanField(default=False)
    procurador = models.ForeignKey(
        Eleitor,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="votos_como_procurador",
    )
    # Unidade adicional declarada pelo próprio morador durante a votação
    # (modo_multiplas_unidades = "morador"). Fica pendente até a administração
    # validar. eleitor = o morador declarante; os dados da unidade vêm digitados.
    unidade_declarada = models.BooleanField(default=False)
    decl_bloco = models.CharField(max_length=20, blank=True, default="")
    decl_apartamento = models.CharField(max_length=20, blank=True, default="")
    decl_nome = models.CharField(max_length=200, blank=True, default="")
    grupo_declaracao = models.UUIDField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Agrupa os votos de uma mesma unidade declarada (para validar em lote).",
    )
    hash_voto = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name_plural = "votos"
        # Sem unique (eleitor, questao): moradores com mais de uma unidade
        # (votos_permitidos > 1) votam N vezes na mesma questão. A cota é
        # garantida na aplicação (registrar_voto, contagem sob select_for_update).
        indexes = [
            models.Index(fields=["assembleia", "questao"], name="voto_assemb_quest_idx"),
            models.Index(fields=["assembleia", "-timestamp"], name="voto_assemb_ts_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self.hash_voto:
            salt = uuid.uuid4().hex
            payload = f"{self.eleitor_id or self.votante_manual_id}:{self.questao_id}:{self.opcao_escolhida_id}:{salt}"
            self.hash_voto = hashlib.sha256(payload.encode()).hexdigest()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Voto {self.id} - {self.eleitor} em {self.questao}"

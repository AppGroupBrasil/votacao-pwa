import hashlib
import uuid

from django.db import models

from apps.assembleias.models import Assembleia, OpcaoVoto, Questao
from apps.eleitores.models import Eleitor


class Voto(models.Model):
    class MetodoAuth(models.TextChoices):
        FACIAL = "facial", "Biometria Facial"
        WEBAUTHN = "webauthn", "WebAuthn"
        OTP = "otp", "OTP"

    class Status(models.TextChoices):
        VALIDADO = "validado", "Validado"
        PENDENTE = "pendente", "Pendente de validação"
        REJEITADO = "rejeitado", "Rejeitado"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assembleia = models.ForeignKey(
        Assembleia, on_delete=models.PROTECT, related_name="votos"
    )
    eleitor = models.ForeignKey(
        Eleitor, on_delete=models.PROTECT, related_name="votos"
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
    hash_voto = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name_plural = "votos"
        constraints = [
            models.UniqueConstraint(
                fields=["eleitor", "questao"],
                name="unique_voto_por_questao",
            )
        ]
        indexes = [
            models.Index(fields=["assembleia", "questao"], name="voto_assemb_quest_idx"),
            models.Index(fields=["assembleia", "-timestamp"], name="voto_assemb_ts_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self.hash_voto:
            salt = uuid.uuid4().hex
            payload = f"{self.eleitor_id}:{self.questao_id}:{self.opcao_escolhida_id}:{salt}"
            self.hash_voto = hashlib.sha256(payload.encode()).hexdigest()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Voto {self.id} - {self.eleitor} em {self.questao}"

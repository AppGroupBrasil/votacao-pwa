import uuid

from django.db import models

from apps.assembleias.models import novo_codigo_curto
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
    exige_identificacao = models.BooleanField(
        default=False,
        help_text=(
            "Se True, o morador só vota após se identificar: selfie, nome, "
            "bloco/apartamento, assinatura e aceite da LGPD (mesma comprovação "
            "da votação da assembleia)."
        ),
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Enquete"
        verbose_name_plural = "Enquetes"

    def save(self, *args, **kwargs):
        if not self.codigo_curto:
            self.codigo_curto = novo_codigo_curto()
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
        related_name="listas_presenca",
        null=True,
        blank=True,
    )
    titulo = models.CharField(max_length=255)
    descricao = models.TextField(
        blank=True,
        default="",
        help_text="Cabeçalho da lista impressa: data, horários, tipo da assembleia.",
    )
    link_reuniao = models.URLField(
        blank=True,
        default="",
        help_text=(
            "Link da sala da assembleia (Meet, Zoom, YouTube ao vivo, etc.). "
            "Só é entregue ao morador depois que ele registra a presença."
        ),
    )
    ativa = models.BooleanField(default=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criado_em"]
        verbose_name = "Lista de presença manual"
        verbose_name_plural = "Listas de presença manual"

    def save(self, *args, **kwargs):
        if not self.codigo_curto:
            self.codigo_curto = novo_codigo_curto()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.titulo


class PresencaManual(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lista = models.ForeignKey(
        ListaPresenca, on_delete=models.CASCADE, related_name="registros"
    )
    identidade = models.ForeignKey(
        "eleitores.IdentidadeFacial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="presencas",
        help_text="Identidade facial permanente reconhecida/cadastrada nesta presença.",
    )
    nome = models.CharField(max_length=200)
    perfil = models.CharField(
        max_length=20,
        choices=[
            ("proprietario", "Proprietário"),
            ("locatario", "Locatário"),
            ("conjuge", "Cônjuge"),
            ("procurador", "Procurador"),
            ("outro", "Outro"),
        ],
        default="proprietario",
    )
    bloco = models.CharField(max_length=20, blank=True, default="")
    apartamento = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    selfie = models.TextField(blank=True, default="")
    assinatura = models.TextField(blank=True, default="")
    metodo_auth = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Como o morador se identificou: facial, webauthn (digital) ou otp (código por e-mail).",
    )
    assinatura_facial = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="Hash SHA-256 do vetor facial capturado (biometria facial).",
    )
    marca_aparelho = models.CharField(max_length=120, blank=True, default="")
    user_agent = models.TextField(blank=True, default="")
    device_info = models.CharField(max_length=255, blank=True, default="")
    consentimento_lgpd = models.BooleanField(default=False)
    consentimento_em = models.DateTimeField(null=True, blank=True)
    declaracao_veracidade = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["criado_em"]
        constraints = [
            # Uma identidade facial só marca presença uma vez por lista.
            # Condição idêntica à da migration 0009 (identidade preenchida), para
            # não gerar migração fantasma que derrubaria/recriaria a constraint.
            models.UniqueConstraint(
                fields=("lista", "identidade"),
                condition=models.Q(("identidade__isnull", False)),
                name="unique_presenca_identidade_por_lista",
            )
        ]

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
    votante_selfie = models.TextField(blank=True, default="")
    votante_assinatura = models.TextField(blank=True, default="")
    consentimento_lgpd = models.BooleanField(default=False)
    consentimento_em = models.DateTimeField(null=True, blank=True)
    declaracao_veracidade = models.BooleanField(default=False)
    marca_aparelho = models.CharField(max_length=120, blank=True, default="")
    user_agent = models.TextField(blank=True, default="")
    geo_lat = models.FloatField(null=True, blank=True)
    geo_lng = models.FloatField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["enquete", "device_id"],
                condition=~models.Q(device_id=""),
                name="unique_enquete_device",
            )
        ]

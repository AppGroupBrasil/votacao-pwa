import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("condominios", "0001_initial"),
        ("eleitores", "0010_eleitor_central_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="IdentidadeFacial",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nome", models.CharField(max_length=200)),
                ("bloco", models.CharField(blank=True, default="", max_length=20)),
                (
                    "apartamento",
                    models.CharField(blank=True, default="", max_length=20),
                ),
                (
                    "perfil",
                    models.CharField(
                        blank=True, default="proprietario", max_length=20
                    ),
                ),
                (
                    "descriptor",
                    models.JSONField(
                        help_text="Vetor facial 128-D (face-api). Base da comparação para reconhecer a pessoa."
                    ),
                ),
                (
                    "selfie",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Foto-comprovante capturada no cadastro.",
                    ),
                ),
                ("consentimento_lgpd", models.BooleanField(default=False)),
                ("consentimento_em", models.DateTimeField(blank=True, null=True)),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
                ("ultimo_visto_em", models.DateTimeField(auto_now=True)),
                (
                    "condominio",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="identidades_faciais",
                        to="condominios.condominio",
                    ),
                ),
            ],
            options={
                "verbose_name": "Identidade facial",
                "verbose_name_plural": "Identidades faciais",
                "ordering": ["nome"],
            },
        ),
    ]

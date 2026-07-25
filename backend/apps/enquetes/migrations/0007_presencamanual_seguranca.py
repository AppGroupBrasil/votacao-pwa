from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("enquetes", "0006_listapresenca_descricao"),
    ]

    operations = [
        migrations.AddField(
            model_name="presencamanual",
            name="perfil",
            field=models.CharField(
                choices=[
                    ("proprietario", "Proprietário"),
                    ("locatario", "Locatário"),
                    ("conjuge", "Cônjuge"),
                    ("procurador", "Procurador"),
                    ("outro", "Outro"),
                ],
                default="proprietario",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="metodo_auth",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Como o morador se identificou: facial, webauthn (digital) ou otp (código por e-mail).",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="assinatura_facial",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Hash SHA-256 do vetor facial capturado (biometria facial).",
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="marca_aparelho",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="user_agent",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="device_info",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="consentimento_lgpd",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="consentimento_em",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="presencamanual",
            name="declaracao_veracidade",
            field=models.BooleanField(default=False),
        ),
    ]

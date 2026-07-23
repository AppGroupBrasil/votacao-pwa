from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("votos", "0008_alter_voto_eleitor_alter_voto_metodo_auth_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="voto",
            name="metodo_auth",
            field=models.CharField(
                choices=[
                    ("facial", "Biometria Facial"),
                    ("selfie", "Selfie"),
                    ("webauthn", "WebAuthn"),
                    ("otp", "OTP"),
                    ("manual", "Manual com selfie"),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="voto",
            name="marca_aparelho",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="voto",
            name="selfie",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="voto",
            name="assinatura",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="voto",
            name="modo_participacao",
            field=models.CharField(
                choices=[("presencial", "Presencial"), ("online", "Online")],
                default="presencial",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="voto",
            name="geo_lat",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="voto",
            name="geo_lng",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="voto",
            name="consentimento_lgpd",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="voto",
            name="consentimento_em",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="voto",
            name="declaracao_veracidade",
            field=models.BooleanField(default=False),
        ),
    ]

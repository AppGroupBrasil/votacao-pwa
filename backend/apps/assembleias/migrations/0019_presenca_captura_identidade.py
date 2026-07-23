from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0018_presenca_inadimplente"),
    ]

    operations = [
        migrations.AddField(
            model_name="presenca",
            name="marca_aparelho",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Marca/modelo do aparelho informado pelo navegador",
                max_length=120,
            ),
        ),
        migrations.AddField(
            model_name="presenca",
            name="selfie",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Foto (base64) capturada na identificação, quando houver",
            ),
        ),
        migrations.AddField(
            model_name="presenca",
            name="assinatura",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Assinatura desenhada (base64), quando houver",
            ),
        ),
        migrations.AddField(
            model_name="presenca",
            name="modo_participacao",
            field=models.CharField(
                choices=[("presencial", "Presencial"), ("online", "Online")],
                default="presencial",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="presenca",
            name="geo_lat",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="presenca",
            name="geo_lng",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="presenca",
            name="consentimento_lgpd",
            field=models.BooleanField(
                default=False,
                help_text="Aceite LGPD para captura de biometria/selfie/assinatura",
            ),
        ),
        migrations.AddField(
            model_name="presenca",
            name="consentimento_em",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="presenca",
            name="declaracao_veracidade",
            field=models.BooleanField(
                default=False,
                help_text="Declarou veracidade das informações (voto anulável se falso)",
            ),
        ),
    ]

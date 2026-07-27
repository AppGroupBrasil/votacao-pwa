from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("enquetes", "0009_presencamanual_unique_identidade"),
    ]

    operations = [
        migrations.AddField(
            model_name="enquete",
            name="exige_identificacao",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Se True, o morador só vota após se identificar: selfie, nome, "
                    "bloco/apartamento, assinatura e aceite da LGPD (mesma comprovação "
                    "da votação da assembleia)."
                ),
            ),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="votante_selfie",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="votante_assinatura",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="consentimento_lgpd",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="consentimento_em",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="declaracao_veracidade",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="marca_aparelho",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="user_agent",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="geo_lat",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="geo_lng",
            field=models.FloatField(blank=True, null=True),
        ),
    ]

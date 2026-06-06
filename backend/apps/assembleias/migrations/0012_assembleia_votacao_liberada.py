from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0011_logauditoria"),
    ]

    operations = [
        migrations.AddField(
            model_name="assembleia",
            name="votacao_liberada",
            field=models.BooleanField(
                default=False,
                help_text="Se False, a assembleia está aberta para presença mas os votos ficam travados até a liberação.",
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0012_assembleia_votacao_liberada"),
    ]

    operations = [
        migrations.AddField(
            model_name="questao",
            name="encerrada",
            field=models.BooleanField(
                default=False,
                help_text="Se True, a votação deste item foi encerrada e não aceita novos votos.",
            ),
        ),
    ]

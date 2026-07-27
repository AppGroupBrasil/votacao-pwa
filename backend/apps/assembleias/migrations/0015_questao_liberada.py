from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0014_assembleia_codigo_curto"),
    ]

    operations = [
        migrations.AddField(
            model_name="questao",
            name="liberada",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Se False, a votação deste item está bloqueada: o morador vê o item "
                    "como 'aguarde o debate' e não pode votar até a administração liberar."
                ),
            ),
        ),
    ]

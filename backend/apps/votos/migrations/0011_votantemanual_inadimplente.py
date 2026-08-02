from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("votos", "0010_votantemanual_identidade_facial"),
    ]

    operations = [
        migrations.AddField(
            model_name="votantemanual",
            name="inadimplente",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Marcado pelo síndico/administradora no painel: os votos são "
                    "invalidados e a unidade fica impedida de votar."
                ),
            ),
        ),
    ]

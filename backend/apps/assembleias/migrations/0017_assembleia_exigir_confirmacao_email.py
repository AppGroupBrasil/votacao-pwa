from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0016_segunda_chamada_qualquer_numero_default_true"),
    ]

    operations = [
        migrations.AddField(
            model_name="assembleia",
            name="exigir_confirmacao_email",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Se True, votar exige código de confirmação enviado por e-mail; "
                    "se False, o eleitor vota imediatamente após informar o e-mail."
                ),
            ),
        ),
    ]

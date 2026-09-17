from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0022_cpf_na_entrada"),
    ]

    operations = [
        migrations.AddField(
            model_name="assembleia",
            name="resultado_publico",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Chave do síndico. Ligada, qualquer um com o link acompanha o "
                    "placar de cada questão ao vivo, sem nomes. Desligada, só o "
                    "painel vê o resultado — nem pela API sai alguma contagem."
                ),
            ),
        ),
    ]

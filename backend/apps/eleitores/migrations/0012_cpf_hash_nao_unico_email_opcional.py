# Gerada à mão: CPF/CNPJ deixa de ser único (uma pessoa pode ter várias
# unidades; a construtora repete o mesmo CNPJ) e e-mail passa a ser opcional
# (importação por lista da assembleia não traz e-mail).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0011_identidadefacial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="eleitor",
            name="cpf_hash",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Hash SHA-256 do CPF/CNPJ. Não é único: uma pessoa pode ter várias unidades e a construtora repete o CNPJ.",
                max_length=64,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="eleitor",
            name="email",
            field=models.EmailField(blank=True, default="", max_length=200),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0008_eleitor_senha_eleitor_senha_alterada"),
    ]

    operations = [
        migrations.AddField(
            model_name="eleitor",
            name="votos_permitidos",
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text="Quantidade de votos a que tem direito (uma unidade = 1). Aumente quando o morador possui mais de uma unidade.",
            ),
        ),
    ]

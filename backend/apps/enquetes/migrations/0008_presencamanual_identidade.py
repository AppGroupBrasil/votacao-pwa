import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0011_identidadefacial"),
        ("enquetes", "0007_presencamanual_seguranca"),
    ]

    operations = [
        migrations.AddField(
            model_name="presencamanual",
            name="identidade",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="presencas",
                to="eleitores.identidadefacial",
                help_text="Identidade facial permanente reconhecida/cadastrada nesta presença.",
            ),
        ),
    ]

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0011_identidadefacial"),
        ("votos", "0009_voto_captura_identidade"),
    ]

    operations = [
        migrations.AddField(
            model_name="votantemanual",
            name="identidade_facial",
            field=models.ForeignKey(
                blank=True,
                help_text="Rosto reconhecido (quando entrou pela facial). Garante 1 voto por rosto.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="votantes_manuais",
                to="eleitores.identidadefacial",
            ),
        ),
        migrations.AddConstraint(
            model_name="votantemanual",
            constraint=models.UniqueConstraint(
                condition=models.Q(("identidade_facial__isnull", False)),
                fields=("assembleia", "identidade_facial"),
                name="uniq_votante_facial_por_assembleia",
            ),
        ),
    ]

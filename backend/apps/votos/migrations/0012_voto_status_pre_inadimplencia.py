from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("votos", "0011_votantemanual_inadimplente"),
    ]

    operations = [
        migrations.AddField(
            model_name="voto",
            name="status_pre_inadimplencia",
            field=models.CharField(
                blank=True,
                default="",
                help_text=(
                    "Status que o voto tinha antes de ser invalidado por inadimplência. "
                    "Guardado ao marcar a unidade e usado para devolver o voto à "
                    "contagem quando a inadimplência é removida."
                ),
                max_length=10,
            ),
        ),
    ]

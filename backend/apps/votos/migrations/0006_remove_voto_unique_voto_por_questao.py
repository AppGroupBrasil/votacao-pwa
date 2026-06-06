from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("votos", "0005_voto_por_procuracao_voto_procurador_voto_status"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="voto",
            name="unique_voto_por_questao",
        ),
    ]

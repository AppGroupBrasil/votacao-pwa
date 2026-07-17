from django.db import migrations, models


def set_qualquer_numero(apps, schema_editor):
    Assembleia = apps.get_model("assembleias", "Assembleia")
    Assembleia.objects.update(segunda_chamada_qualquer_numero=True)


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0015_assembleia_modo_multiplas_unidades_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="assembleia",
            name="segunda_chamada_qualquer_numero",
            field=models.BooleanField(
                default=True,
                help_text="Se True, 2ª chamada aceita qualquer número dos presentes",
            ),
        ),
        migrations.RunPython(set_qualquer_numero, migrations.RunPython.noop),
    ]

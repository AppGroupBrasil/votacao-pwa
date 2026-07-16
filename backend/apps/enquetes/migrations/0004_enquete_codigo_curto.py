from django.db import migrations, models

from apps.assembleias.models import gerar_codigo_curto


def preencher_codigos(apps, schema_editor):
    Enquete = apps.get_model("enquetes", "Enquete")
    Assembleia = apps.get_model("assembleias", "Assembleia")
    usados = set(
        Assembleia.objects.exclude(codigo_curto__isnull=True).values_list(
            "codigo_curto", flat=True
        )
    )
    usados.update(
        Enquete.objects.exclude(codigo_curto__isnull=True).values_list(
            "codigo_curto", flat=True
        )
    )
    for enquete in Enquete.objects.filter(codigo_curto__isnull=True):
        codigo = gerar_codigo_curto()
        while codigo in usados:
            codigo = gerar_codigo_curto()
        usados.add(codigo)
        enquete.codigo_curto = codigo
        enquete.save(update_fields=["codigo_curto"])


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0014_assembleia_codigo_curto"),
        ("enquetes", "0003_listapresenca_presencamanual"),
    ]

    operations = [
        migrations.AddField(
            model_name="enquete",
            name="codigo_curto",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Código curto do link compartilhável: appvotacao.com.br/v/<codigo>.",
                max_length=8,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(preencher_codigos, migrations.RunPython.noop),
    ]

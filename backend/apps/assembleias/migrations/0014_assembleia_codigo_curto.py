import secrets

from django.db import migrations, models

ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def backfill_codigos(apps, schema_editor):
    Assembleia = apps.get_model("assembleias", "Assembleia")
    usados = set(
        Assembleia.objects.exclude(codigo_curto__isnull=True).values_list(
            "codigo_curto", flat=True
        )
    )
    for assembleia in Assembleia.objects.filter(codigo_curto__isnull=True):
        while True:
            codigo = "".join(secrets.choice(ALFABETO) for _ in range(4))
            if codigo not in usados:
                usados.add(codigo)
                break
        assembleia.codigo_curto = codigo
        assembleia.save(update_fields=["codigo_curto"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0013_questao_encerrada"),
    ]

    operations = [
        migrations.AddField(
            model_name="assembleia",
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
        migrations.RunPython(backfill_codigos, noop),
    ]

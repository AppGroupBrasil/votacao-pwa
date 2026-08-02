import secrets

from django.db import migrations, models

ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def gerar_codigos(apps, schema_editor):
    """Dá um código curto a cada item já cadastrado, sem repetir os códigos que
    já estão em uso por assembleias, enquetes e listas de presença."""
    Questao = apps.get_model("assembleias", "Questao")
    Assembleia = apps.get_model("assembleias", "Assembleia")
    Enquete = apps.get_model("enquetes", "Enquete")
    ListaPresenca = apps.get_model("enquetes", "ListaPresenca")

    usados = set()
    for modelo in (Assembleia, Enquete, ListaPresenca, Questao):
        usados.update(
            c for c in modelo.objects.values_list("codigo_curto", flat=True) if c
        )

    for questao in Questao.objects.filter(codigo_curto__isnull=True):
        for _ in range(50):
            codigo = "".join(secrets.choice(ALFABETO) for _ in range(3))
            if codigo not in usados:
                usados.add(codigo)
                questao.codigo_curto = codigo
                questao.save(update_fields=["codigo_curto"])
                break


def limpar_codigos(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("assembleias", "0016_assembleia_link_reuniao"),
        ("enquetes", "0005_listapresenca_codigo_curto"),
    ]

    operations = [
        migrations.AddField(
            model_name="questao",
            name="codigo_curto",
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text=(
                    "Código curto do link deste item: appvotacao.com.br/v/<codigo> "
                    "abre a votação só desta questão."
                ),
                max_length=8,
                null=True,
                unique=True,
            ),
        ),
        migrations.RunPython(gerar_codigos, limpar_codigos),
    ]

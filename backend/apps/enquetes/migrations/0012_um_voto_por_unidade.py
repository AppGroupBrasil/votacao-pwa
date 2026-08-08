import django.db.models.deletion
from django.db import migrations, models


def preencher_unidade_chave(apps, schema_editor):
    """Preenche a chave da unidade nos votos que já existem.

    Votos históricos duplicados (a mesma unidade votou duas vezes antes desta
    trava existir) ficam com a chave em branco, para preservar o registro sem
    impedir a criação da constraint.
    """
    from apps.eleitores.models import normalizar_unidade

    EnqueteVoto = apps.get_model("enquetes", "EnqueteVoto")
    vistos = set()
    pendentes = []
    for voto in EnqueteVoto.objects.order_by("criado_em").iterator():
        ap = normalizar_unidade(voto.votante_apartamento)
        if not ap:
            continue
        chave = f"{normalizar_unidade(voto.votante_bloco)}|{ap}"
        par = (voto.enquete_id, chave)
        if par in vistos:
            continue
        vistos.add(par)
        voto.unidade_chave = chave
        pendentes.append(voto)
    EnqueteVoto.objects.bulk_update(pendentes, ["unidade_chave"], batch_size=500)


def limpar_unidade_chave(apps, schema_editor):
    EnqueteVoto = apps.get_model("enquetes", "EnqueteVoto")
    EnqueteVoto.objects.update(unidade_chave="")


class Migration(migrations.Migration):

    dependencies = [
        ("enquetes", "0011_listapresenca_link_reuniao"),
    ]

    operations = [
        migrations.AddField(
            model_name="enquete",
            name="um_voto_por_unidade",
            field=models.BooleanField(
                default=True,
                help_text=(
                    "Se True, cada bloco/apartamento vota uma única vez, mesmo que a "
                    "pessoa troque de aparelho. Só vale quando há identificação."
                ),
            ),
        ),
        migrations.AddField(
            model_name="enquete",
            name="lista_presenca",
            field=models.ForeignKey(
                blank=True,
                help_text="Lista de presença ligada a esta votação.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="enquetes",
                to="enquetes.listapresenca",
            ),
        ),
        migrations.AddField(
            model_name="enquete",
            name="exige_presenca",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Se True, só vota a unidade que já registrou presença na lista acima."
                ),
            ),
        ),
        migrations.AddField(
            model_name="enquetevoto",
            name="unidade_chave",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text=(
                    "bloco|apartamento normalizados. Preenchido apenas quando a enquete "
                    "trava um voto por unidade; é o que garante a trava no banco."
                ),
                max_length=48,
            ),
        ),
        migrations.RunPython(preencher_unidade_chave, limpar_unidade_chave),
        migrations.AddConstraint(
            model_name="enquetevoto",
            constraint=models.UniqueConstraint(
                condition=models.Q(("unidade_chave", ""), _negated=True),
                fields=("enquete", "unidade_chave"),
                name="unique_enquete_unidade",
            ),
        ),
    ]

"""Um CPF, um cadastro de rosto por condomínio.

Antes desta trava, dois envios ao mesmo tempo (duplo clique, duas abas, celular
repetindo o pedido em rede ruim) criavam dois cadastros do mesmo morador. Cada
cadastro marcava a sua presença, e o quórum subia com gente que não existe.

A migração junta os cadastros repetidos antes de ligar a trava, porque o banco
recusa criar o índice se ainda houver repetição.
"""

from django.db import migrations, models

# Mesmo teto de leituras por rosto usado em apps/eleitores/facial.py.
MAX_TEMPLATES = 5
TAMANHO_DESCRIPTOR = 128


def _vetores(ident):
    """Leituras faciais guardadas neste cadastro, sem repetir."""
    saida = []
    lista = ident.descriptors if isinstance(ident.descriptors, list) else []
    for item in lista:
        if (
            isinstance(item, list)
            and len(item) == TAMANHO_DESCRIPTOR
            and item not in saida
        ):
            saida.append(item)
    principal = ident.descriptor
    if (
        isinstance(principal, list)
        and len(principal) == TAMANHO_DESCRIPTOR
        and principal not in saida
    ):
        saida.append(principal)
    return saida


def juntar_repetidos(apps, schema_editor):
    Identidade = apps.get_model("eleitores", "IdentidadeFacial")
    Votante = apps.get_model("votos", "VotanteManual")
    Presenca = apps.get_model("enquetes", "PresencaManual")

    repetidos = (
        Identidade.objects.exclude(cpf_hash="")
        .exclude(cpf_hash__isnull=True)
        .values("condominio_id", "cpf_hash")
        .annotate(quantos=models.Count("id"))
        .filter(quantos__gt=1)
    )

    for chave in repetidos:
        grupo = list(
            Identidade.objects.filter(
                condominio_id=chave["condominio_id"], cpf_hash=chave["cpf_hash"]
            ).order_by("criado_em", "id")
        )
        if len(grupo) < 2:
            continue
        principal, extras = grupo[0], grupo[1:]

        # O cadastro que fica herda as leituras de todos: quanto mais fotos do
        # mesmo rosto, melhor ele é reconhecido depois.
        vetores = _vetores(principal)
        for extra in extras:
            for v in _vetores(extra):
                if v not in vetores:
                    vetores.append(v)
        vetores = vetores[:MAX_TEMPLATES]
        principal.descriptors = vetores
        if vetores:
            principal.descriptor = vetores[0]
        if not principal.selfie:
            for extra in extras:
                if extra.selfie:
                    principal.selfie = extra.selfie
                    break
        principal.save()

        ids_extras = [e.id for e in extras]

        # Cada assembleia aceita um votante por rosto. Se a assembleia já tem
        # alguém ligado ao cadastro que fica, o registro repetido perde o vínculo
        # e acende o selo para a mesa decidir: apagar o voto de uma pessoa de
        # verdade seria pior do que mostrar a duplicidade a quem conduz a sessão.
        for votante in Votante.objects.filter(identidade_facial_id__in=ids_extras):
            ocupado = (
                Votante.objects.filter(
                    assembleia_id=votante.assembleia_id,
                    identidade_facial_id=principal.id,
                )
                .exclude(id=votante.id)
                .exists()
            )
            if ocupado:
                votante.identidade_facial_id = None
                votante.conferir_na_mesa = True
                votante.motivo_conferencia = (
                    votante.motivo_conferencia or "duplicidade"
                )
            else:
                votante.identidade_facial_id = principal.id
            votante.save()

        # Mesma regra na lista de presença.
        for pres in Presenca.objects.filter(identidade_id__in=ids_extras):
            ocupado = (
                Presenca.objects.filter(
                    lista_id=pres.lista_id, identidade_id=principal.id
                )
                .exclude(id=pres.id)
                .exists()
            )
            if ocupado:
                pres.identidade_id = None
                pres.conferir_na_mesa = True
                pres.motivo_conferencia = pres.motivo_conferencia or "duplicidade"
            else:
                pres.identidade_id = principal.id
            pres.save()

        Identidade.objects.filter(id__in=ids_extras).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("eleitores", "0014_identidadefacial_cpf_hash_and_more"),
        ("votos", "0013_votantemanual_conferido_em_and_more"),
        ("enquetes", "0013_presencamanual_conferido_em_and_more"),
    ]

    operations = [
        migrations.RunPython(juntar_repetidos, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="identidadefacial",
            constraint=models.UniqueConstraint(
                condition=models.Q(("cpf_hash", ""), _negated=True),
                fields=("condominio", "cpf_hash"),
                name="uniq_identidade_cpf_por_condominio",
            ),
        ),
    ]

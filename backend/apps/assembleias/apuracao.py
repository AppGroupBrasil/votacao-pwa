"""Números da apuração que a tela e os relatórios em PDF precisam dizer igual.

Na assembleia sem relação de moradores ("Criar assembleia": o morador se
identifica na hora), não existe lista de votantes. A base passa a ser o total
de unidades do cadastro do condomínio; sem ele, ninguém sabe quantas unidades
são aptas e o quórum não é calculado.
"""

from apps.eleitores.models import normalizar_unidade


def unidades_cadastradas(assembleia):
    """Unidades aptas pela relação de moradores: os votantes da assembleia ou,
    sem eles, os moradores cadastrados no condomínio."""
    return assembleia.votantes.count() or assembleia.condominio.eleitores.count()


def base_unidades(assembleia):
    """Unidades aptas a votar; 0 quando ninguém informou quantas são."""
    return unidades_cadastradas(assembleia) or assembleia.condominio.total_unidades or 0


def unidades_presentes(assembleia):
    """Unidades com presença registrada. Duas pessoas do mesmo apartamento
    contam uma vez: o voto também é um por unidade."""
    return len(
        {
            (normalizar_unidade(bloco), normalizar_unidade(apartamento))
            for bloco, apartamento in assembleia.presencas.values_list(
                "bloco", "apartamento"
            )
            if normalizar_unidade(apartamento)
        }
    )


def questao_encerrada(questao, assembleia):
    """Fechar a assembleia encerra a votação de todos os itens."""
    return questao.encerrada or assembleia.status == assembleia.Status.ENCERRADA

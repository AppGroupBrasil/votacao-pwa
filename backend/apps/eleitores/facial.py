"""Reconhecimento facial no servidor.

Compara vetores faciais (descriptor de 128 posições do face-api) pela distância
euclidiana. Quanto menor a distância, mais parecidos os rostos. É o mesmo cálculo
que o face-api usa no navegador — só que aqui rodamos no servidor para reconhecer
a mesma pessoa em qualquer aparelho.
"""
import math
import os

# Limiar de reconhecimento (distância euclidiana máxima para tratar como a mesma
# pessoa). Objetivo aqui é só evitar voto duplo — não é segurança financeira —,
# então priorizamos RECONHECER com facilidade (evitar pedir cadastro de novo) em
# vez de ser rígido. O face-api usa 0.6 no 1:1; aqui subimos um pouco (0.65) para
# tolerar variação de luz/ângulo/câmera e não deixar de reconhecer a mesma pessoa.
# Ajustável sem redeploy pela variável de ambiente FACIAL_LIMIAR.
try:
    LIMIAR_RECONHECIMENTO = float(os.environ.get("FACIAL_LIMIAR", "0.65"))
except (TypeError, ValueError):
    LIMIAR_RECONHECIMENTO = 0.65

# Na LISTA DE PRESENÇA o erro caro é o contrário: confundir dois rostos deixa o
# morador fora do quórum e grava o nome de outra pessoa num documento oficial,
# enquanto um registro duplicado é visível na lista e o síndico apaga. Por isso
# aqui usamos o limiar padrão do modelo (0.60), mais rígido que o da votação.
# Ajustável sem redeploy pela variável de ambiente FACIAL_LIMIAR_PRESENCA.
try:
    LIMIAR_PRESENCA = float(os.environ.get("FACIAL_LIMIAR_PRESENCA", "0.60"))
except (TypeError, ValueError):
    LIMIAR_PRESENCA = 0.60

# Tamanho esperado do vetor facial do face-api.
TAMANHO_DESCRIPTOR = 128


def validar_descriptor(bruto):
    """Confere se o dado recebido é um vetor facial válido. Retorna a lista de
    floats ou None se for inválido."""
    if not isinstance(bruto, list) or len(bruto) != TAMANHO_DESCRIPTOR:
        return None
    try:
        return [float(x) for x in bruto]
    except (TypeError, ValueError):
        return None


def distancia(a, b):
    """Distância euclidiana entre dois vetores faciais."""
    if not a or not b or len(a) != len(b):
        return float("inf")
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def melhor_correspondencia(descriptor, identidades, limiar=LIMIAR_RECONHECIMENTO):
    """Procura, entre as identidades já cadastradas, o rosto mais parecido.

    Retorna (identidade, distancia) da mais próxima quando ela fica abaixo do
    limiar (reconhecida). Se ninguém for parecido o suficiente, retorna
    (None, menor_distancia_encontrada)."""
    melhor = None
    melhor_dist = float("inf")
    for ident in identidades:
        d = distancia(descriptor, ident.descriptor)
        if d < melhor_dist:
            melhor_dist = d
            melhor = ident
    if melhor is not None and melhor_dist < limiar:
        return melhor, melhor_dist
    return None, melhor_dist

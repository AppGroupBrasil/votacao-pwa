"""Reconhecimento facial no servidor.

Compara vetores faciais (descriptor de 128 posições do face-api) pela distância
euclidiana. Quanto menor a distância, mais parecidos os rostos. É o mesmo cálculo
que o face-api usa no navegador — só que aqui rodamos no servidor para reconhecer
a mesma pessoa em qualquer aparelho.
"""
import math

# Limiar de reconhecimento. O face-api usa 0.6 para comparar 1 rosto com 1 rosto.
# Aqui procuramos 1 rosto entre vários (busca 1:N), então usamos um valor um pouco
# mais rígido para reduzir a chance de confundir duas pessoas diferentes.
LIMIAR_RECONHECIMENTO = 0.55

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

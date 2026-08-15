"""Reconhecimento facial no servidor.

Compara vetores faciais (descriptor de 128 posições do face-api) pela distância
euclidiana. Quanto menor a distância, mais parecidos os rostos.

O rosto NÃO escolhe mais quem é a pessoa. Quem diz o nome é o CPF; o rosto só
confirma ("é você mesmo?"), comparando um contra um. Essa inversão é o que
elimina a troca de identidade: procurar um rosto no meio de centenas erra com
frequência que cresce junto com o tamanho do condomínio, enquanto confirmar
contra um único cadastro tem sempre a mesma dificuldade, com 10 ou 5.000
moradores.
"""
import math
import os

# --- Confirmação um-contra-um (o caminho normal, via CPF) ---
# 0.50 é mais rígido que o 0.60 de referência do modelo porque aqui errar tem
# consequência barata: quando o rosto não bate, a presença é registrada mesmo
# assim com a selfie do momento e um selo para a mesa conferir. Ninguém fica de
# fora; só passa pela vista do síndico.
# Ajustável sem redeploy pela variável de ambiente FACIAL_LIMIAR_VERIFICACAO.
try:
    LIMIAR_VERIFICACAO = float(os.environ.get("FACIAL_LIMIAR_VERIFICACAO", "0.50"))
except (TypeError, ValueError):
    LIMIAR_VERIFICACAO = 0.50

# --- Busca um-contra-todos (legado / quando não há CPF na base) ---
# Bem mais rígido que o 0.60 do modelo: aquele valor é calibrado para conferir
# UMA pessoa, não para escolher entre centenas. Numa base de 500 rostos, 0.60
# praticamente garante que alguém casa com o cadastro errado — foi o que
# aconteceu na assembleia de 08/08/2026.
try:
    LIMIAR_BUSCA = float(os.environ.get("FACIAL_LIMIAR_BUSCA", "0.45"))
except (TypeError, ValueError):
    LIMIAR_BUSCA = 0.45

# Distância mínima que o segundo colocado precisa ficar atrás do primeiro para a
# escolha valer. Se dois moradores estão praticamente empatados, o sistema não
# tem como saber qual é — e chutar é justamente o que gravava o nome errado num
# documento oficial. Nesse caso ele não decide: pede o CPF.
try:
    MARGEM_AMBIGUIDADE = float(os.environ.get("FACIAL_MARGEM", "0.06"))
except (TypeError, ValueError):
    MARGEM_AMBIGUIDADE = 0.06

# Nomes antigos, mantidos para o código que ainda não migrou.
LIMIAR_RECONHECIMENTO = LIMIAR_BUSCA
LIMIAR_PRESENCA = LIMIAR_BUSCA

# Tamanho esperado do vetor facial do face-api.
TAMANHO_DESCRIPTOR = 128

# Quantas leituras do rosto guardamos por pessoa. Cada uma é uma foto diferente
# (luz, ângulo, óculos, barba); comparar contra a mais parecida das cinco
# reconhece a mesma pessoa em situações variadas sem afrouxar o limiar.
MAX_TEMPLATES = 5


def validar_descriptor(bruto):
    """Confere se o dado recebido é um vetor facial válido. Retorna a lista de
    floats ou None se for inválido."""
    if not isinstance(bruto, list) or len(bruto) != TAMANHO_DESCRIPTOR:
        return None
    try:
        vetor = [float(x) for x in bruto]
    except (TypeError, ValueError):
        return None
    if any(math.isnan(x) or math.isinf(x) for x in vetor):
        return None
    # Vetor zerado é câmera tampada/erro de leitura, não rosto: ele fica a uma
    # distância parecida de todo mundo e casaria com qualquer um.
    if not any(vetor):
        return None
    return vetor


def validar_lista_descriptors(bruto, maximo=MAX_TEMPLATES):
    """Valida uma lista de vetores faciais (várias leituras do mesmo rosto).
    Descarta os inválidos e devolve no máximo `maximo` vetores."""
    if not isinstance(bruto, list):
        return []
    validos = []
    for item in bruto[: maximo * 2]:
        v = validar_descriptor(item)
        if v is not None:
            validos.append(v)
        if len(validos) >= maximo:
            break
    return validos


def distancia(a, b):
    """Distância euclidiana entre dois vetores faciais."""
    if not a or not b or len(a) != len(b):
        return float("inf")
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def templates_de(identidade):
    """Todas as leituras guardadas de um rosto.

    Cadastros antigos têm só o campo `descriptor`; os novos guardam também a
    lista `descriptors`. Esta função entrega as duas coisas como uma lista só,
    para o resto do código não precisar saber a diferença."""
    vetores = []
    lista = getattr(identidade, "descriptors", None)
    if isinstance(lista, list):
        for item in lista:
            v = validar_descriptor(item)
            if v is not None:
                vetores.append(v)
    principal = validar_descriptor(getattr(identidade, "descriptor", None))
    if principal is not None and principal not in vetores:
        vetores.append(principal)
    return vetores


def tem_biometria(identidade):
    """Diz se há algum vetor guardado para comparar.

    Quem entrou pela selfie (a câmera não leu o rosto naquele dia) fica com o
    cadastro sem nenhum vetor. Comparar com isso devolve distância infinita, o
    que reprovaria a pessoa certa em toda assembleia seguinte."""
    return bool(templates_de(identidade))


def salvar_identidade_nova(ident, leituras=()):
    """Grava um cadastro de rosto novo sem correr o risco de criar dois.

    Dois envios ao mesmo tempo — duplo clique, duas abas, celular repetindo o
    pedido em rede ruim — chegavam juntos, os dois liam "não existe" e os dois
    gravavam. O condomínio ficava com dois cadastros do mesmo CPF, cada um
    marcando a sua presença, e o quórum subia com gente que não existe.

    O banco agora recusa o segundo. Aqui a gente aproveita o cadastro que já
    está lá — com as leituras desta tentativa — em vez de mostrar erro para um
    morador que não fez nada de errado.

    Devolve (identidade, criada)."""
    from django.db import IntegrityError, transaction

    for v in leituras:
        ident.guardar_leitura(v)

    if not ident.cpf_hash:
        # Condomínio sem planilha: a trava não vale e não há como saber que dois
        # cadastros são a mesma pessoa.
        ident.save()
        return ident, True

    try:
        with transaction.atomic():
            ident.save(force_insert=True)
        return ident, True
    except IntegrityError:
        existente = (
            type(ident)
            ._default_manager.filter(
                condominio_id=ident.condominio_id, cpf_hash=ident.cpf_hash
            )
            .order_by("criado_em")
            .first()
        )
        if existente is None:
            # Bateu em outra trava qualquer: não é o caso que sabemos resolver.
            raise

    for v in templates_de(ident):
        existente.guardar_leitura(v)
    existente.nome = ident.nome or existente.nome
    existente.bloco = ident.bloco or existente.bloco
    existente.apartamento = ident.apartamento or existente.apartamento
    existente.perfil = ident.perfil or existente.perfil
    if ident.selfie and not existente.selfie:
        existente.selfie = ident.selfie
    existente.save()
    return existente, False


def distancia_ate(descriptor, identidade):
    """Distância do rosto lido até o cadastro — usando a leitura mais parecida
    das que estão guardadas para aquela pessoa."""
    menor = float("inf")
    for t in templates_de(identidade):
        d = distancia(descriptor, t)
        if d < menor:
            menor = d
    return menor


def verificar(descriptor, identidade, limiar=None):
    """Confirmação um-contra-um: o rosto lido é da pessoa deste cadastro?

    Retorna (confere, distancia). `confere` é False também quando a pessoa
    ainda não tem rosto cadastrado — nesse caso a distância volta infinita e
    quem chamou decide o que fazer (normalmente: cadastrar agora)."""
    if limiar is None:
        limiar = LIMIAR_VERIFICACAO
    d = distancia_ate(descriptor, identidade)
    return d < limiar, d


def melhor_correspondencia(descriptor, identidades, limiar=None):
    """Busca um-contra-todos, com recusa em caso de empate.

    Retorna (identidade, distancia) quando UMA pessoa fica abaixo do limiar e
    com folga suficiente sobre a segunda colocada. Se ninguém for parecido o
    bastante, ou se duas pessoas ficarem quase empatadas, retorna (None, dist) —
    e aí o certo é pedir o CPF em vez de adivinhar."""
    if limiar is None:
        limiar = LIMIAR_BUSCA
    melhor = None
    melhor_dist = float("inf")
    segunda_dist = float("inf")
    for ident in identidades:
        d = distancia_ate(descriptor, ident)
        if d < melhor_dist:
            segunda_dist = melhor_dist
            melhor_dist = d
            melhor = ident
        elif d < segunda_dist:
            segunda_dist = d
    if melhor is None or melhor_dist >= limiar:
        return None, melhor_dist
    if segunda_dist - melhor_dist < MARGEM_AMBIGUIDADE:
        # Dois rostos igualmente parecidos: sem condição de saber qual é.
        return None, melhor_dist
    return melhor, melhor_dist

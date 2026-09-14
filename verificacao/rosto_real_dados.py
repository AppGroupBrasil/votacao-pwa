"""Dados do teste com rostos reais (verificacao/rosto_real.js).

Rodar a partir de backend/, com DATABASE_URL apontando para o banco de teste:

    python ../verificacao/rosto_real_dados.py semear
    python ../verificacao/rosto_real_dados.py fechar <assembleia_id>
    python ../verificacao/rosto_real_dados.py conferir <condominio_id>
"""
import hashlib
import json
import os
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.utils import timezone  # noqa: E402

from apps.assembleias.models import Assembleia  # noqa: E402
from apps.condominios.models import Condominio  # noqa: E402
from apps.eleitores.facial import distancia  # noqa: E402
from apps.eleitores.models import Eleitor, IdentidadeFacial  # noqa: E402

# CPFs válidos de exemplo; a tela manda só o hash, igual ao sistema real.
ANA, BRUNA, CARLA, PAULA = "11144477735", "52998224725", "12345678909", "39053344705"


def _hash(cpf):
    return hashlib.sha256(cpf.encode()).hexdigest()


def semear():
    agora = timezone.now()
    cond = Condominio.objects.create(
        nome="Residencial Teste Real",
        cnpj=f"TESTE-{agora.timestamp():.0f}",
        total_unidades=10,
    )
    for nome, cpf, bloco, apto in (
        ("Ana Real", ANA, "A", "101"),
        ("Bruna Real", BRUNA, "A", "102"),
        ("Carla Real", CARLA, "B", "201"),
    ):
        Eleitor.objects.create(
            condominio=cond, nome=nome, cpf_hash=_hash(cpf), bloco=bloco,
            apartamento=apto, email=f"{cpf}@teste.com",
        )
    # Regra ligada, prazo ainda aberto: o cadastro antecipado funciona.
    assembleia = Assembleia.objects.create(
        condominio=cond,
        titulo="AGE Teste Real",
        data_inicio=agora + timedelta(hours=30),
        data_fim=agora + timedelta(hours=34),
        status=Assembleia.Status.ABERTA,
        somente_cadastro_antecipado=True,
        cadastro_antecedencia_horas=24,
    )
    print(json.dumps({"condominio": str(cond.id), "assembleia": str(assembleia.id)}))


def fechar(assembleia_id):
    """Início em 3h com 24h de antecedência: o cadastro já fechou."""
    a = Assembleia.objects.get(id=assembleia_id)
    agora = timezone.now()
    a.data_inicio = agora + timedelta(hours=3)
    a.data_fim = agora + timedelta(hours=6)
    a.save()


def conferir(condominio_id):
    ids = {i.nome: i for i in IdentidadeFacial.objects.filter(condominio_id=condominio_id)}
    erros = []
    ana, carla, paula = ids.get("Ana Real"), ids.get("Carla Real"), ids.get("Paula Procuradora")
    if not (ana and carla and paula):
        erros.append(f"cadastros esperados não gravados: {sorted(ids)}")
    else:
        if ana.suspeita_duplicidade:
            erros.append("Ana (primeiro cadastro do rosto) saiu marcada como duplicidade")
        if not carla.suspeita_duplicidade:
            d = min(distancia(x, y) for x in ana.descriptors for y in carla.descriptors)
            erros.append(f"Carla usou o rosto da Ana e não foi marcada (distância {d:.3f})")
        if paula.perfil != "procurador" or paula.cpf_hash != _hash(PAULA):
            erros.append("Paula (fora da planilha) não gravou como procuradora")
        for i in (ana, carla, paula):
            if not i.cadastro_antecipado_em or not i.selfie.startswith("data:image/"):
                erros.append(f"{i.nome}: sem data de cadastro antecipado ou sem foto")
    if erros:
        print("\n".join(erros))
        sys.exit(1)
    print("banco: Ana ok, Carla marcada como mesmo rosto de outro CPF, Paula como procuradora")


if __name__ == "__main__":
    comando, *args = sys.argv[1:]
    {"semear": semear, "fechar": fechar, "conferir": conferir}[comando](*args)

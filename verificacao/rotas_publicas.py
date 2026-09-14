"""Lista toda rota do backend que atende sem login e compara com a lista das
que são públicas de propósito (verificacao/rotas_publicas.txt).

Rota pública nova que não está na lista derruba o check-up: ou ela entra na
lista conscientemente, ou ganha guarda. Rodar a partir de backend/:

    python ../verificacao/rotas_publicas.py
"""
import os
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402
from rest_framework.permissions import AllowAny  # noqa: E402


def _rotas(padroes, prefixo=""):
    for p in padroes:
        if isinstance(p, URLResolver):
            if p.app_name == "admin":
                # O admin do Django põe a própria guarda (staff) em cada tela.
                continue
            yield from _rotas(p.url_patterns, prefixo + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefixo + str(p.pattern), p.callback


def _situacao(callback):
    """'protegida', 'publica' ou 'fora-do-drf' (view Django pura)."""
    cls = getattr(callback, "cls", None)
    if cls is None:
        return "fora-do-drf"
    if "get_permissions" in vars(cls):
        # Permissão decidida em tempo de execução: não dá para ler daqui.
        return "dinamica"
    initkwargs = getattr(callback, "initkwargs", {}) or {}
    permissoes = initkwargs.get("permission_classes", cls.permission_classes)
    if not permissoes or any(p is AllowAny for p in permissoes):
        return "publica"
    return "protegida"


def main():
    permitidas = set()
    arquivo = AQUI / "rotas_publicas.txt"
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.split("#", 1)[0].strip()
        if linha:
            permitidas.add(linha)

    vistas = set()
    novas = []
    for rota, callback in _rotas(get_resolver().url_patterns):
        situacao = _situacao(callback)
        if situacao == "protegida":
            continue
        chave = f"{situacao} {rota}"
        vistas.add(chave)
        if chave not in permitidas:
            novas.append(chave)

    sobrando = sorted(permitidas - vistas)
    if sobrando:
        print("Na lista de públicas, mas a rota não existe mais (limpar a lista):")
        for r in sobrando:
            print("  ", r)
    if novas:
        print("ROTA SEM LOGIN FORA DA LISTA (dar guarda ou incluir de propósito):")
        for r in sorted(novas):
            print("  ", r)
        sys.exit(1)
    print(f"Rotas sem login: {len(vistas)}, todas previstas.")


if __name__ == "__main__":
    main()

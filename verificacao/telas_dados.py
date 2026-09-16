"""Dados do teste das telas (verificacao/telas.js).

Rodar a partir de backend/, com DATABASE_URL apontando para o banco de teste:

    python ../verificacao/telas_dados.py semear

Cria o administrador que faz login no painel e o condomínio usado nas
simulações (20 unidades), e imprime as credenciais em JSON.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.contrib.auth.models import User  # noqa: E402

from apps.condominios.models import Condominio  # noqa: E402

EMAIL = "checkup@teste.local"
SENHA = "123456"
CONDOMINIO = "Condomínio Checkup Telas"


def semear():
    admin, _ = User.objects.get_or_create(
        username=EMAIL, defaults={"email": EMAIL, "first_name": "Checkup"}
    )
    admin.is_staff = admin.is_superuser = True
    admin.set_password(SENHA)
    admin.save()
    Condominio.objects.get_or_create(
        nome=CONDOMINIO, defaults={"cnpj": "CHECKUP-TELAS", "total_unidades": 20}
    )
    print(json.dumps({"email": EMAIL, "senha": SENHA, "condominio": CONDOMINIO}))


if __name__ == "__main__":
    comando, *args = sys.argv[1:]
    {"semear": semear}[comando](*args)

"""
Teste de carga para a API de votação.

Uso:
    pip install locust
    # Cenário 1: leitura pública (assembleias abertas)
    locust -f loadtest/locustfile.py --host https://votacao.example.com -u 500 -r 50 -t 5m

Variáveis opcionais:
    BASE_PATH=/api  (padrão)
    ASSEMBLEIA_ID=<uuid> para também bater /api/assembleias/<id>/

O cenário de POST /votar/ é simulado em modo "best-effort" — sem token JWT real
ele retorna 403 mas valida o caminho de rate-limit + atomic transaction sob carga.
"""
import os
import random
import uuid

from locust import HttpUser, between, task


BASE = os.getenv("BASE_PATH", "/api")
ASSEMBLEIA_ID = os.getenv("ASSEMBLEIA_ID")


class VotanteAnonimo(HttpUser):
    wait_time = between(0.5, 2.5)

    @task(5)
    def listar_abertas(self):
        self.client.get(f"{BASE}/assembleias/abertas/", name="abertas")

    @task(3)
    def healthz(self):
        self.client.get(f"{BASE}/healthz/", name="healthz")

    @task(2)
    def detalhe_assembleia(self):
        if not ASSEMBLEIA_ID:
            return
        self.client.get(f"{BASE}/assembleias/{ASSEMBLEIA_ID}/", name="assembleia_detalhe")

    @task(1)
    def tentativa_voto_invalida(self):
        if not ASSEMBLEIA_ID:
            return
        # bate no endpoint para medir caminho até a validação de token
        self.client.post(
            f"{BASE}/votos/{ASSEMBLEIA_ID}/votar/",
            json={
                "eleitor_id": str(uuid.uuid4()),
                "questao_id": str(uuid.uuid4()),
                "opcao_id": str(uuid.uuid4()),
                "auth_token": "invalido",
            },
            name="votar_invalido",
            catch_response=True,
        )

    @task(1)
    def verificar_voto(self):
        h = "".join(random.choices("0123456789abcdef", k=64))
        with self.client.get(
            f"{BASE}/votos/verificar/?hash={h}",
            name="verificar_voto",
            catch_response=True,
        ) as r:
            if r.status_code in (200, 404):
                r.success()

#!/usr/bin/env bash
# Check-up do App Votação. Da raiz do repositório:
#
#   bash verificacao/checkup.sh
#
# PYTHON=<python com as dependências do backend>  (padrão: backend/venv ou python)
# PROD_SSH=usuario@host  confere o schema no banco de produção (sem ele, o passo
#                        é pulado e isso aparece no resumo — não conta como OK).
#
# Cobre: tipos e build, migrações, schema do banco vivo, rotas sem login fora da
# lista de públicas, isolamento entre condomínios e ponta a ponta das funções
# (os dois últimos estão nos testes do backend: tests.py de cada app).

set -u
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

if [ -z "${PYTHON:-}" ]; then
  if [ -x backend/venv/Scripts/python.exe ]; then PYTHON="$RAIZ/backend/venv/Scripts/python.exe"
  elif [ -x backend/venv/bin/python ]; then PYTHON="$RAIZ/backend/venv/bin/python"
  else PYTHON=python; fi
fi

export DJANGO_SECRET_KEY=checkup DJANGO_DEBUG=True DATABASE_URL=

falhas=()
pulados=()

etapa() { printf '\n== %s\n' "$1"; }
rodar() {
  local nome="$1"; shift
  if "$@"; then echo "   ok: $nome"; else echo "   FALHOU: $nome"; falhas+=("$nome"); fi
}

etapa "Backend"
rodar "manage.py check" bash -c "cd backend && '$PYTHON' manage.py check"
rodar "migrações em dia com os models" bash -c "cd backend && '$PYTHON' manage.py makemigrations --check --dry-run"
rodar "testes (isolamento e ponta a ponta inclusos)" bash -c "cd backend && '$PYTHON' manage.py test 2>&1 | grep -v 'INFO audit' | tail -5; exit \${PIPESTATUS[0]}"

etapa "Rotas sem login"
rodar "só as públicas de propósito" "$PYTHON" verificacao/rotas_publicas.py

etapa "Frontend"
if [ ! -d frontend/node_modules ]; then
  rodar "npm ci" bash -c "cd frontend && npm ci --no-audit --no-fund >/dev/null"
fi
export NEXT_PUBLIC_API_URL=http://localhost:8000/api
rodar "tipos (tsc)" bash -c "cd frontend && npx tsc --noEmit"
rodar "lint" bash -c "cd frontend && npm run lint >/dev/null"
# O build regrava o service worker, que é versionado: devolve como estava.
sw_limpo=$(git status --porcelain -- frontend/public/sw.js 'frontend/public/workbox-*.js')
rodar "build" bash -c "cd frontend && npm run build >/dev/null"
if [ -z "$sw_limpo" ]; then
  git checkout -- frontend/public/sw.js 'frontend/public/workbox-*.js' 2>/dev/null
fi

# Página que quebra ao ser montada no servidor sai com 500 e só se recupera no
# navegador — o build não acusa. Foi assim com o TensorFlow do reconhecimento
# facial importado direto nas páginas da votação e do convite.
paginas_montam() {
  local porta=3999 uuid=00000000-0000-4000-8000-000000000000 ruins=0 pid
  (cd frontend && PORT=$porta HOSTNAME=127.0.0.1 node .next/standalone/server.js >/dev/null 2>&1) &
  pid=$!
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://127.0.0.1:$porta/" && break
    sleep 1
  done
  for rota in / /acesso /login "/votacao/$uuid" "/presenca/$uuid" "/presenca-manual/$uuid" \
      "/cadastro/token-de-teste" "/autocadastro/token-de-teste" "/cadastro-facial/$uuid" \
      "/enquete/$uuid" /diagnostico-facial /passo-a-passo; do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$porta$rota")
    if [ "$codigo" != "200" ]; then echo "   $rota respondeu $codigo"; ruins=1; fi
  done
  kill "$pid" 2>/dev/null
  pkill -f "standalone/server.js" 2>/dev/null
  if command -v netstat >/dev/null && command -v taskkill >/dev/null; then
    for p in $(netstat -ano | grep LISTENING | grep ":$porta " | awk '{print $5}'); do
      taskkill //PID "$p" //F >/dev/null 2>&1
    done
  fi
  return $ruins
}
rodar "páginas públicas montam no servidor (sem 500)" paginas_montam

etapa "Postgres (mesmo banco da produção), rostos reais e telas"
# SQLite dos testes esconde diferença de banco. Aqui sobe um Postgres 16 igual ao
# de produção, aplica as migrações, roda os testes nele e usa o mesmo banco para
# o teste com rostos reais: cadastro antecipado pela câmera e entrada na votação.
PG_CONTAINER=votacao-checkup-pg
PG_URL="postgres://votacao:checkup@127.0.0.1:55432/votacao_db"

parar_porta() {
  if command -v taskkill >/dev/null 2>&1; then
    for p in $(netstat -ano | grep LISTENING | grep ":$1 " | awk '{print $5}' | sort -u); do
      taskkill //PID "$p" //F //T >/dev/null 2>&1
    done
  else
    fuser -k "$1/tcp" >/dev/null 2>&1
  fi
}

porta_ocupada() {
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/"
}

postgres_e_rostos() {
  local ok=0 ids cond asm lista lista_sem
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1
  docker run -d --rm --name "$PG_CONTAINER" -e POSTGRES_DB=votacao_db -e POSTGRES_USER=votacao \
    -e POSTGRES_PASSWORD=checkup -p 55432:5432 postgres:16-alpine >/dev/null || return 1
  for _ in $(seq 1 60); do
    docker exec "$PG_CONTAINER" pg_isready -U votacao -d votacao_db >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 2

  (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" manage.py migrate --noinput >/dev/null) || ok=1
  (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" manage.py migrate --check) && echo "   ok: migrações aplicadas no Postgres" || ok=1
  (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" manage.py test --noinput 2>&1 | grep -E "^Ran |^OK|FAILED"; exit "${PIPESTATUS[0]}") \
    && echo "   ok: testes no Postgres" || ok=1

  if [ $ok -eq 0 ]; then
    ids=$(cd backend && DATABASE_URL="$PG_URL" "$PYTHON" ../verificacao/rosto_real_dados.py semear)
    cond=$(echo "$ids" | sed -E 's/.*"condominio": "([^"]+)".*/\1/')
    asm=$(echo "$ids" | sed -E 's/.*"assembleia": "([^"]+)".*/\1/')
    lista=$(echo "$ids" | sed -E 's/.*"lista": "([^"]+)".*/\1/')
    lista_sem=$(echo "$ids" | sed -E 's/.*"lista_sem_planilha": "([^"]+)".*/\1/')
    (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" ../verificacao/telas_dados.py semear >/dev/null)
    (cd backend && DATABASE_URL="$PG_URL" CORS_ALLOWED_ORIGINS=http://localhost:3998 \
      DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:3998,http://127.0.0.1:3998 \
      "$PYTHON" manage.py runserver 127.0.0.1:8000 --noreload >/dev/null 2>&1) &
    (cd frontend && npx next start -p 3998 >/dev/null 2>&1) &
    for _ in $(seq 1 60); do
      porta_ocupada 3998 && curl -s -o /dev/null "http://127.0.0.1:8000/api/healthz/" && break
      sleep 1
    done
    npx --prefix frontend playwright install chromium >/dev/null 2>&1
    # Rostos reais: cadastro antecipado, lista de presença e entrada na
    # votação. Depois, as telas do painel e do morador.
    node verificacao/rosto_real.js rostos \
      && node verificacao/rosto_real.js cadastro "$cond" \
      && (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" ../verificacao/rosto_real_dados.py conferir "$cond" | sed 's/^/   /') \
      && node verificacao/rosto_real.js lista "$lista" "$lista_sem" \
      && (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" ../verificacao/rosto_real_dados.py conferir_lista "$lista" "$lista_sem" | sed 's/^/   /') \
      && (cd backend && DATABASE_URL="$PG_URL" "$PYTHON" ../verificacao/rosto_real_dados.py fechar "$asm") \
      && node verificacao/rosto_real.js porta "$asm" \
      && node verificacao/telas.js todas \
      || ok=1
    parar_porta 3998
    parar_porta 8000
  fi
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1
  return $ok
}

if ! docker info >/dev/null 2>&1; then
  echo "   pulado: Docker não está rodando"
  pulados+=("Postgres e rostos reais (ligue o Docker)")
elif porta_ocupada 8000 || porta_ocupada 3998; then
  # O frontend de teste é compilado apontando para a API em localhost:8000.
  echo "   pulado: portas 8000 ou 3998 em uso (feche o servidor local e rode de novo)"
  pulados+=("Postgres e rostos reais (portas ocupadas)")
else
  rodar "Postgres + rostos reais + telas (painel e morador)" postgres_e_rostos
fi

etapa "Schema no banco de produção"
if [ -n "${PROD_SSH:-}" ]; then
  rodar "nenhuma migração pendente em produção" ssh "$PROD_SSH" \
    "cd /opt/votacao && docker compose -f docker-compose.coolify.yml exec -T backend python manage.py migrate --check"
else
  echo "   pulado: defina PROD_SSH=usuario@host"
  pulados+=("schema do banco de produção")
fi

printf '\n== Resumo\n'
for p in "${pulados[@]}"; do echo "   NÃO VERIFICADO: $p"; done
if [ ${#falhas[@]} -eq 0 ]; then
  echo "   tudo ok"
  exit 0
fi
for f in "${falhas[@]}"; do echo "   FALHOU: $f"; done
exit 1

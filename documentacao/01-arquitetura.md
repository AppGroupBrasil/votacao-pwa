# Arquitetura

## Stack

- **Backend:** Django + Django REST Framework, servido por gunicorn na porta 8000.
- **Frontend:** Next.js 14 (app router) com `output: "standalone"` + next-pwa (service worker / PWA).
- **Banco:** PostgreSQL (container próprio).
- **Proxy:** Traefik (coolify-proxy) **compartilhado por ~18-30 domínios** — NÃO migrar para Caddy nem
  remover; a rota deste app fica em `votacao.yaml` no servidor.

## Produção

- **Servidor:** Hetzner — IP `46.225.191.114`.
- **Domínio:** `appvotacao.com.br`.
- **Diretório:** `/opt/votacao`.
- **Orquestração:** `docker compose` (backend, frontend, banco).

## Deploy (automático)

1. `git push` para o branch `master`.
2. GitHub Actions (`.github/workflows/deploy.yml`) conecta por SSH ao servidor.
3. No servidor: `git reset --hard origin/master`, rebuild do stack via docker compose e
   `manage.py migrate`.
4. **Os testes do backend rodam como gate** — se algum teste falhar, o deploy falha e nada sobe.

Remote git: `agb` → `https://github.com/AppGroupBrasil/votacao-pwa.git`.

## Estrutura de pastas

```
backend/
  apps/
    assembleias/   # Assembleia, Questao, OpcaoVoto, Presenca, LogAuditoria
    votos/         # registro de voto, presença, resultados, votação pública
    eleitores/     # moradores (Eleitor)
    condominios/   # Condominio
  core/            # auth do eleitor, permissões, urls raiz
frontend/
  src/app/         # páginas (app router)
  src/lib/         # api.ts (cliente HTTP), types.ts
  src/components/  # WebAuthnVerify, FaceVerify, OtpVerify, etc.
documentacao/      # esta pasta
```

## Autenticação (dois mundos)

- **Admin (síndico / administradora / master):** JWT. Endpoints protegidos por `IsAdminWithRole`.
- **Eleitor (morador):** sessão própria via e-mail/login + senha (token assinado, salt `eleitor-session`).
  Para votar é preciso um **auth_token** assinado (salt `vote-auth`, validade 15 min) gerado após a
  verificação biométrica (facial / WebAuthn / OTP por e-mail).

# Histórico de correções

Ordem cronológica das correções recentes e o motivo de cada uma.

## 1. Link curto `/v/1` só funcionava para uma pessoa

**Causa:** o service worker do PWA cacheava a rota nova; clientes com SW antigo davam "não
encontrada". **Correção:** redirect server-side em `next.config.js` (HTTP, ignora o cache).
Commits `a87fb94`, `a518196`, `302737b`.

## 2. Link da assembleia dava "não encontrada" para todos menos o admin

**Causa:** a página `/votacao/[id]` buscava as questões em `/api/assembleias/{id}/`, que é
**admin-only** → 401 para moradores. **Correção provisória:** redirecionar quem não tinha sessão
para `/acesso`. (Correção definitiva no item 6.)

## 3. Bloqueio de voto reforçado

"Um voto por unidade" passou a comparar bloco/apartamento **case-insensitive e sem espaços**
(`iexact` + `.strip()`). Inadimplente e bloqueado já barravam. Commit `1680232`.

## 4. Impressão e registro facial

- Botão de imprimir o registro da biometria na lista de moradores.
- Coluna "Registro facial" na lista de presença (+ CSV).
Commit `1680232`.

## 5. Votação em duas fases (presença x voto)

Novo campo `votacao_liberada` (migração `0012`). Abrir → presença liberada, voto travado;
botão Liberar/Travar no painel admin; tela "Aguardando liberação" para o morador.
Commits `e2cda38`, `5571994` (ajuste dos testes — o gate de liberação fazia 5 testes falharem;
adicionado `votacao_liberada=True` na fixture).

## 6. Votação acessível ao morador (correção definitiva) — commit `98ae5d1`

**Problema raiz:** não existia endpoint público para listar as questões; a página dependia do
detail admin-only. Resultado: só admin conseguia ver as questões — uma assembleia chegou a votar
pelo chat. **Correções:**

- Novo `GET /api/votos/{id}/votacao/` (AllowAny) devolvendo título/status/`votacao_liberada`/
  questões **sem** expor presenças, identidades ou votos.
- `getAssembleiaPublic` passou a usar esse endpoint.
- `/acesso` agora leva o morador a `/votacao/{id}?eleitor=...` após a presença (botão
  "Ir para a votação").
- Tela "Aguardando liberação" reconsulta a cada 6s e abre sozinha ao liberar.
- Removido o redirect `/v/1` com UUID fixo (apontava para uma assembleia já encerrada) → agora vai
  para `/acesso`.

## Lições

- Toda rota usada pelo morador precisa ser pública e **não** vazar identidade/voto.
- Atalhos e rotas novas: usar redirect server-side por causa do cache do PWA.
- Mudança que adiciona gate de voto exige atualizar as fixtures de teste (o deploy roda os testes
  como gate).

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

## 7. Voto sem login, votos múltiplos e encerrar item — commit `e8c6781`

Pacote de funcionalidades para o link de votação compartilhado no chat da reunião (sem senha).

**Identificação sem login.** O morador acessa o link e se identifica por biometria facial,
digital (WebAuthn) ou e-mail com código (OTP). Nenhuma senha. Novo componente
`IdentificacaoEmail.tsx` e endpoints OTP por e-mail (ver item abaixo).

**Auto-inscrição na lista de votantes.** No voto próprio, um morador do **mesmo condomínio** que
ainda não estava em `assembleia.votantes` é inscrito automaticamente ao votar — antes recebia 403
e não conseguia votar pelo link. Procuração e eleitor de outro condomínio continuam exigindo
inscrição prévia. (`registrar_voto`.)

**`votos_permitidos` por eleitor.** Campo novo no `Eleitor` (migração `0009`, default 1),
configurável por admin/master no cadastro do morador. Morador com mais de uma unidade vota N vezes
na mesma questão. A cota é checada na aplicação (contagem sob `select_for_update`), não mais por
constraint de banco.

- **Removida a `UniqueConstraint(eleitor, questao)`** (migração `votos/0006`). Ela tornava
  `votos_permitidos > 1` impossível: o 2º voto batia em `IntegrityError`. Com `votos_permitidos = 1`
  (a maioria), o comportamento é idêntico ao da constraint — 1º voto passa, 2º recebe 409.
- O `select_for_update` na linha da assembleia serializa votos concorrentes do mesmo eleitor,
  evitando corrida que furaria a cota.

**Encerrar/reabrir votação por item.** Campo `Questao.encerrada` (migração `assembleias/0013`).
`POST /assembleias/{id}/questoes/{questao_id}/encerrar/` com `{ "encerrar": true|false }`. Item
encerrado sai da sequência do morador e recusa novos votos (409). O frontend filtra questões
encerradas e acompanha as já respondidas por id, resiliente a encerramento ao vivo.

**Apuração — percentual sobre votos possíveis.** `percentual_participacao` passou a dividir por
`Sum(votos_permitidos)` dos votantes, não pelo headcount. Sem isso, morador multi-unidade fazia o
percentual passar de 100%. Idêntico ao anterior em assembleias normais (todos = 1).

**Rate limit OTP com corpo JSON.** O `django_ratelimit` com chave `post:campo` lê `request.POST`
(form-encoded) e ficava vazio com corpo JSON — todos caíam num bucket global. Substituído por
chaves que leem o campo do corpo JSON (`_ratekey_email`, `_ratekey_eleitor`). Limites por IP
mantidos.

**Testes adicionados** (gate de deploy): voto rejeitado em questão encerrada (409), segundo voto
permitido com `votos_permitidos = 2` (201), auto-inscrição do morador do condomínio.

## Lições

- Toda rota usada pelo morador precisa ser pública e **não** vazar identidade/voto.
- Atalhos e rotas novas: usar redirect server-side por causa do cache do PWA.
- Mudança que adiciona gate de voto exige atualizar as fixtures de teste (o deploy roda os testes
  como gate).

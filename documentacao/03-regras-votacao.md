# Regras de votação

Implementadas em `backend/apps/votos/views.py` (`registrar_voto`), dentro de uma transação
`select_for_update`. A rota é pública (`AllowAny`) com rate limit de 30/min por IP, mas todo voto
exige `auth_token` válido.

## Verificações na ordem em que ocorrem

1. **Assembleia aberta** — `status == "aberta"`, senão HTTP 400.
2. **Votação liberada** — `votacao_liberada == true`, senão HTTP 400
   ("A votação ainda não foi liberada").
3. **Dentro do período** — entre `data_inicio` e `data_fim`, senão HTTP 400.
4. **auth_token válido** — assinado (salt `vote-auth`), não expirado (15 min), pertence à
   assembleia e ao eleitor; senão HTTP 403.
5. **Inadimplente** — bloqueado (HTTP 403, código `inadimplente`, com WhatsApp da administradora).
6. **Bloqueado** — morador bloqueado pela administração (HTTP 403).
7. **Item encerrado** — se a questão tem `encerrada == true`, recusa o voto (HTTP 409,
   "A votação deste item foi encerrada").
8. **Cota de votos na questão** — o eleitor pode votar até `votos_permitidos` vezes na mesma
   questão (default 1; > 1 quando possui mais de uma unidade). Ao exceder, HTTP 409. Procuração
   **não** consome a cota do procurador.
9. **Um voto por unidade** — barra outra pessoa da mesma unidade (mesmo condomínio + bloco +
   apartamento). Comparação **case-insensitive e sem espaços** (`iexact` + `.strip()`); exclui o
   próprio eleitor (permite os votos múltiplos da cota acima).
10. **Conflito de dispositivo** — mesmo `device_id` em eleitores diferentes (HTTP 409).
11. **Eleitor na lista de votantes** — no voto próprio, um morador do **mesmo condomínio** que
    ainda não esteja em `assembleia.votantes` é **inscrito automaticamente** (suporta o link sem
    login). A unidade representada em **procuração** continua exigindo inscrição prévia; eleitor de
    outro condomínio é recusado (HTTP 403).

`votos_permitidos` é definido por admin/master no cadastro do morador
(`/admin/eleitores/novo` e `.../editar`).

## Voto secreto (regra inviolável)

O voto é secreto. A verificação pública de comprovante (`/votos/verificar/?hash=...`) **NUNCA**
pode revelar o eleitor nem a opção escolhida. O relatório detalhado de auditoria (admin) expõe
identidade + questão + opção, mas **não** IP/dispositivo/user-agent ao cliente.

O endpoint público de votação (`/votos/{id}/votacao/`) também não expõe presenças nem votos.

## Duas fases — liberar / travar

- **Abrir assembleia** (`POST /assembleias/{id}/abrir/`) coloca `status = "aberta"` e
  `votacao_liberada = false` → moradores entram e registram presença, mas os votos ficam travados.
- **Liberar / travar votação** (`POST /assembleias/{id}/liberar-votacao/` com `{ "liberar": true|false }`)
  alterna `votacao_liberada`. Botões "Liberar votação" / "Travar votação" no painel admin
  (`/admin/assembleias/[id]`), visíveis quando a assembleia está aberta.
- **Encerrar votação desse item** (`POST /assembleias/{id}/questoes/{questao_id}/encerrar/` com
  `{ "encerrar": true|false }`) encerra/reabre uma questão individual. Item encerrado sai da
  sequência de votação do morador e recusa novos votos (HTTP 409). Botão no painel admin alterna
  para "Reabrir votação".
- **Encerrar** finaliza a assembleia.

Permite deixar as questões prontas e só liberar o voto no momento certo da reunião.

## Quórum

Calculado sobre a base de eleitores x presentes, com regras de 1ª chamada (ex.: 50% + 1) e 2ª
chamada (quórum reduzido ou qualquer número). Exibido no painel admin e usado na ata.

## Procuração

Um morador pode votar por outra unidade que representa (`por_procuracao`). Esse voto fica
**pendente** até o síndico validar a procuração (`/assembleias/.../procuracoes/validar/`).

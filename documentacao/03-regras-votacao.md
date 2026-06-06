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
7. **Um voto por unidade** — barra outra pessoa da mesma unidade (mesmo condomínio + bloco +
   apartamento). Comparação **case-insensitive e sem espaços** (`iexact` + `.strip()`).
8. **Sem voto duplicado na questão** — o eleitor não pode votar duas vezes na mesma questão
   (HTTP 409).
9. **Conflito de dispositivo** — mesmo `device_id` em eleitores diferentes (HTTP 409).
10. **Eleitor na lista de votantes** — precisa estar em `assembleia.votantes` (HTTP 403).

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
- **Encerrar** finaliza a assembleia.

Permite deixar as questões prontas e só liberar o voto no momento certo da reunião.

## Quórum

Calculado sobre a base de eleitores x presentes, com regras de 1ª chamada (ex.: 50% + 1) e 2ª
chamada (quórum reduzido ou qualquer número). Exibido no painel admin e usado na ata.

## Procuração

Um morador pode votar por outra unidade que representa (`por_procuracao`). Esse voto fica
**pendente** até o síndico validar a procuração (`/assembleias/.../procuracoes/validar/`).

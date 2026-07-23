# Endpoints da API

Prefixo: `/api/`. Admin = exige JWT + `IsAdminWithRole`. Público = `AllowAny`.

## Votos / votação (`/api/votos/`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET  | `/votos/{id}/votacao/` | Público | Título, status, `votacao_liberada` e questões/opções. **Sem** presenças/votos. Usado pela tela do morador. |
| POST | `/votos/{id}/votar/` | Público* | Registra um voto. Exige `auth_token`. Aplica todas as regras de bloqueio. |
| POST | `/votos/{id}/presenca/` | Público* | Registra presença após biometria. Exige `auth_token`. |
| GET  | `/votos/{id}/unidades/` | Público* | Unidades votantes (para voto por procuração). |
| GET  | `/votos/{id}/procuracoes/` | Admin | Pendentes: procurações **e** unidades declaradas. Cada item tem `id`, `tipo` (`procuracao`/`declarada`), `nome`, `bloco`, `apartamento`, `procurador_nome`, `votos`. |
| POST | `/votos/{id}/procuracoes/validar/` | Admin | Valida/recusa. Corpo `{acao}` + `{eleitor_id}` (procuração) **ou** `{grupo_declaracao}` (unidade declarada). |
| GET  | `/votos/{id}/resultados/` | Admin | Apuração por questão. |
| GET  | `/votos/{id}/relatorio/` | Admin | Relatório detalhado (auditoria). |
| GET  | `/votos/verificar/?hash=...` | Público | Confere comprovante sem revelar eleitor/opção. |

\* Públicas mas protegidas por `auth_token` assinado e/ou rate limit.

## Identificação sem login por e-mail (`/api/otp/`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/otp/send-email/` | Público | `{email, assembleia_id}` — resolve o eleitor pelo condomínio da assembleia e envia OTP. Retorna `{sent, email_masked}`. Rate limit ip 5/m, e-mail 3/m. |
| POST | `/otp/verify-email/` | Público | `{email, assembleia_id, code}` — valida OTP, registra presença e devolve `{authenticated, method:"otp", eleitor_id, votos_permitidos, token}`. Rate limit ip 10/m, e-mail 5/m. |
| POST | `/otp/send/` | Público | OTP por `eleitor_id` (fluxo com login). |
| POST | `/otp/verify/` | Público | Verifica OTP por `eleitor_id`. |

As respostas de verificação facial/WebAuthn/OTP também devolvem `votos_permitidos` para a tela do morador.

## Assembleias (`/api/assembleias/`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET/POST | `/assembleias/` | Admin | Lista / cria assembleias. |
| GET/PUT/DELETE | `/assembleias/{id}/` | Admin | Detalhe administrativo (inclui presenças/identidades). |
| GET | `/assembleias/abertas/` | Público | Assembleias abertas (id + título). |
| GET | `/assembleias/resolver/{codigo}/` | Público | Resolve o **link curto**. Recebe o `codigo_curto` (3 chars, case-insensitive via `.upper()`), devolve `{assembleia_id}` ou 404. Usado por `/vote/[code]` e `/v/[code]`. |
| POST | `/assembleias/{id}/abrir/` | Admin | Abre (status=aberta, votacao_liberada=false). |
| POST | `/assembleias/{id}/liberar-votacao/` | Admin | `{liberar:true/false}` — libera/trava o voto. |
| POST | `/assembleias/{id}/encerrar/` | Admin | Encerra a assembleia. |
| ...  | `/assembleias/{id}/questoes/...` | Admin | CRUD de questões. |
| POST | `/assembleias/{id}/questoes/{questao_id}/encerrar/` | Admin | `{encerrar:true/false}` — encerra/reabre a votação daquele item. |

## Eleitor / acesso (`core`)

Login, troca de senha, cadastro de biometria e registro de presença do morador (sessão própria,
salt `eleitor-session`). Dirigem a página `/acesso`.

## Campos importantes

`votacao_liberada` (BooleanField, default `false`) no modelo `Assembleia`
(migração `0012_assembleia_votacao_liberada`). Exposto nos serializers de assembleia e no
endpoint público de votação.

`codigo_curto` (CharField, gerado por `gerar_codigo_curto(tamanho=3)` com alfabeto sem caracteres
ambíguos `23456789ABCDEFGHJKMNPQRSTUVWXYZ`) — o link curto `appvotacao.com.br/vote/<codigo>`.
Migração `assembleias/0014`. Read-only no serializer.

`modo_multiplas_unidades` (CharField, choices `sindico`/`morador`, default `sindico`) — escolhe como
donos de várias unidades votam. Migração `assembleias/0015`. **Writable** no serializer.

`Voto`: `unidade_declarada` (bool), `decl_bloco` / `decl_apartamento` / `decl_nome` e
`grupo_declaracao` (UUID, db_index) suportam o voto de unidade declarada (migração `votos/0007`).

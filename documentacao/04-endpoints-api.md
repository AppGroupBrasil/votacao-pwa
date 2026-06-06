# Endpoints da API

Prefixo: `/api/`. Admin = exige JWT + `IsAdminWithRole`. Público = `AllowAny`.

## Votos / votação (`/api/votos/`)

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET  | `/votos/{id}/votacao/` | Público | Título, status, `votacao_liberada` e questões/opções. **Sem** presenças/votos. Usado pela tela do morador. |
| POST | `/votos/{id}/votar/` | Público* | Registra um voto. Exige `auth_token`. Aplica todas as regras de bloqueio. |
| POST | `/votos/{id}/presenca/` | Público* | Registra presença após biometria. Exige `auth_token`. |
| GET  | `/votos/{id}/unidades/` | Público* | Unidades votantes (para voto por procuração). |
| GET  | `/votos/{id}/procuracoes/` | Admin | Procurações pendentes. |
| POST | `/votos/{id}/procuracoes/validar/` | Admin | Valida/recusa procuração. |
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
| POST | `/assembleias/{id}/abrir/` | Admin | Abre (status=aberta, votacao_liberada=false). |
| POST | `/assembleias/{id}/liberar-votacao/` | Admin | `{liberar:true/false}` — libera/trava o voto. |
| POST | `/assembleias/{id}/encerrar/` | Admin | Encerra a assembleia. |
| ...  | `/assembleias/{id}/questoes/...` | Admin | CRUD de questões. |
| POST | `/assembleias/{id}/questoes/{questao_id}/encerrar/` | Admin | `{encerrar:true/false}` — encerra/reabre a votação daquele item. |

## Eleitor / acesso (`core`)

Login, troca de senha, cadastro de biometria e registro de presença do morador (sessão própria,
salt `eleitor-session`). Dirigem a página `/acesso`.

## Campo importante

`votacao_liberada` (BooleanField, default `false`) no modelo `Assembleia`
(migração `0012_assembleia_votacao_liberada`). Exposto nos serializers de assembleia e no
endpoint público de votação.

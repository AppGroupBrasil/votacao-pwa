# Fluxo de votação do morador

## Link de compartilhamento

Compartilhe sempre **`https://appvotacao.com.br/acesso`** (ou o atalho `/votar`, que redireciona
para `/acesso`). É a porta de entrada pública. **Não** compartilhe `/votacao/[id]` direto — essa
página exige que o morador já esteja autenticado.

## Passo a passo

1. **`/acesso`** — o morador entra com login (e-mail) + senha. Primeiro acesso pode pedir troca de
   senha e cadastro de biometria.
2. **Biometria** — cadastro/verificação facial (ou WebAuthn / OTP por e-mail). Confirma identidade.
3. **Presença** — registrada automaticamente após a biometria. Mostra a lista de presentes.
4. **Botão "Ir para a votação"** — leva a `/votacao/{assembleia_id}?eleitor={eleitor_id}`.
5. **`/votacao/[id]`** — carrega as questões pelo endpoint público `GET /votos/{id}/votacao/`,
   pede uma nova verificação biométrica (gera o `auth_token`) e libera o voto questão a questão.
6. Cada voto gera um **comprovante (hash)** que o morador pode conferir depois em
   `/votacao/comprovante` sem expor a opção escolhida.

## Duas fases (presença x votação)

A página de votação tem duas situações antes de liberar o voto:

- **`votacao_liberada = false`** → mostra a tela **"Aguardando liberação"**. A presença já está
  registrada. A tela **reconsulta o servidor a cada 6 segundos** e abre sozinha quando a
  administração liberar — o morador não precisa recarregar.
- **`votacao_liberada = true`** → as questões aparecem e o voto é aceito.

Ver detalhes em [Regras de votação](03-regras-votacao.md).

## Link sem login para o chat da reunião

Além do fluxo `/acesso` (com login), há a entrada **sem login** pensada para colar no chat da
reunião: `/votacao/{assembleia_id}` direto. Sem `eleitor_id` na URL nem em `localStorage`, a página
mostra a tela de **identificação por e-mail**:

1. O morador digita o e-mail cadastrado. `POST /otp/send-email/` resolve o eleitor pelo condomínio
   da assembleia + e-mail e envia um código (retorna o e-mail mascarado).
2. O morador digita o código. `POST /otp/verify-email/` valida o OTP, registra presença
   automaticamente e devolve `eleitor_id`, `votos_permitidos` e o `auth_token` (salt `vote-auth`).
3. A votação é liberada na sequência das questões — sem senha.

Facial e digital continuam funcionando como identificação, mas **só no dispositivo do cadastro**
(são vinculadas ao aparelho). O **e-mail/OTP é o identificador universal entre dispositivos**.

## Vários votos por unidade (`votos_permitidos`)

Quando o morador possui mais de uma unidade, o admin/master define `votos_permitidos` (> 1) no
cadastro do morador. Nesse caso ele vota **N vezes na mesma questão** (uma por unidade), podendo
escolher opções diferentes. Padrão é **1**. Procuração não consome essa cota — conta para a unidade
representada.

## Encerrar a votação de um item

Admin/master podem encerrar uma questão individualmente pelo botão **"Encerrar votação desse item"**
na página da assembleia (`POST /assembleias/{id}/questoes/{questao_id}/encerrar/`). A questão sai da
sequência de votação e novos votos são recusados com HTTP 409. O botão alterna para
**"Reabrir votação"**.

## Por que existe um endpoint público de votação

A página `/votacao/[id]` precisa listar título e questões **sem** ser admin. O endpoint
`GET /votos/{id}/votacao/` (AllowAny) devolve apenas `titulo`, `descricao`, `status`,
`votacao_liberada` e `questoes/opcoes` — **nunca** presenças, identidades de eleitores ou votos.
Antes desta correção a página batia no detail administrativo (`/assembleias/{id}/`, só admin) e
dava 401 / "não encontrada" para todo morador — por isso uma assembleia chegou a votar pelo chat.

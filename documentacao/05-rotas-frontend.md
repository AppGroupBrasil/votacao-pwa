# Rotas do frontend (Next.js app router)

## Públicas / morador

| Rota | Descrição |
|---|---|
| `/acesso` | **Porta de entrada do morador** (login → biometria → presença → votação). Link a compartilhar. |
| `/votar` | Atalho → redireciona para `/acesso`. |
| `/v/[code]` | Atalho curto. `/v/1` redireciona para `/acesso`. |
| `/votacao/[assembleia_id]` | Tela de votação. Carrega questões via endpoint público; pede biometria; vota. |
| `/votacao/comprovante` | Conferência de comprovante (hash) sem expor a opção. |
| `/enquete/[id]` | Enquete simples/anônima. |
| `/presenca-manual/[id]` | Registro de presença manual (selfie + assinatura). |
| `/contrato`, `/privacidade`, `/termos`, `/excluir-conta` | Páginas institucionais/legais. |

## Autenticação (admin/morador)

`/(auth)/login`, `/(auth)/cadastro`, `/(auth)/cadastro/[token]`,
`/(auth)/autocadastro/[token]`, `/(auth)/recuperar-senha`,
`/(auth)/redefinir-senha/[uid]/[token]`.

## Painel administrativo (`/admin`)

| Rota | Descrição |
|---|---|
| `/admin` | Dashboard. |
| `/admin/assembleias` · `/admin/assembleias/nova` · `/admin/assembleias/[id]` | Lista, criação e gestão (abrir, liberar/travar votação, encerrar). |
| `/admin/assembleias/[id]/presenca` | Lista de presença (com coluna "Registro facial", imprimir, CSV). |
| `/admin/assembleias/[id]/controle` | Acompanhamento de quem já votou. |
| `/admin/assembleias/[id]/resultados`* · `/admin/resultados` | Apuração. |
| `/admin/assembleias/[id]/ata` · `/admin/ata` | Ata com IA (transcrição + geração). |
| `/admin/assembleias/[id]/auditoria` | Log de auditoria. |
| `/admin/eleitores` · `/novo` · `/[id]/editar` | Moradores (imprimir registro da biometria). |
| `/admin/condominios` · `/[id]/editar` | Condomínios. |
| `/admin/enquetes`, `/admin/presenca`, `/admin/listas-presenca/[id]`, `/admin/conta`, `/admin/master`, `/admin/cadastro` | Demais áreas. |

\* Conforme a estrutura de páginas vigente.

## Observação sobre o PWA / cache

O next-pwa cacheia navegações. Rotas **novas** podem não existir no service worker antigo de um
cliente → "não encontrada". Por isso atalhos como `/v/1` e `/votar` são feitos como
**redirects server-side** em `frontend/next.config.js` (nível HTTP, ignoram o cache do SW).
Chamadas `GET /api/*` usam `NetworkOnly` para nunca servir dado velho.

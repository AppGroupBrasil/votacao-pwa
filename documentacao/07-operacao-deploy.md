# Operação e deploy

## Publicar uma mudança

```bash
git add -A
git commit -m "..."
git push agb master
```

O push para `master` dispara o GitHub Actions, que via SSH faz `git reset --hard origin/master`,
rebuilda o stack com docker compose e roda `manage.py migrate`. **Os testes do backend rodam como
gate** — se falharem, o deploy falha e nada sobe. Verifique a aba Actions do repositório.

O deploy sobe o código novo **antes** do `migrate`: durante alguns segundos, rotas que leem colunas
novas dão erro. Nunca publicar com assembleia ou lista de presença em uso.

Antes e depois de publicar: `bash verificacao/checkup.sh` (com `PROD_SSH=usuario@host` confere
também as migrações em produção). Detalhes no `CLAUDE.md` da raiz.

## Banco de produção é separado

A produção **não** recebe dados via deploy. Para levar/baixar dados (eleitores, condomínios),
sincronizar manualmente com `dumpdata` / `loaddata` no servidor. Nunca presumir que um registro
criado local apareça em produção.

## Infra compartilhada (cuidado)

O Traefik (coolify-proxy) atende ~18-30 domínios no mesmo servidor. **Não** migrar para outro
proxy, mexer no `prod.yml` global nem remover a configuração compartilhada. A rota deste app fica
em `votacao.yaml` no servidor.

## Dúvidas comuns

- **"O morador diz que dá não encontrada."** Confirme que ele está usando `/acesso`, não
  `/votacao/[id]` direto. Se for cache do PWA, peça para recarregar (Ctrl+F5) ou usar guia anônima.
- **"Liberei a votação mas o morador não vê."** A tela do morador reconsulta a cada 6s; aguarde
  alguns segundos. Confirme `votacao_liberada=true` no painel.
- **"O morador diz que o cadastro está encerrado."** A assembleia tem "Somente cadastro com
  antecedência" ligada e o prazo (início − horas) passou. Quem já tem rosto entra; para reabrir,
  diminua as horas ou desligue a chave na edição da assembleia.
- **"Deploy falhou."** Quase sempre é teste do backend. Rode os testes localmente antes de subir
  mudanças que afetem voto/presença e atualize as fixtures.

## Modelo de dados (resumo)

`Condominio` → `Eleitor` (morador) → `Assembleia` → `Questao` → `OpcaoVoto`. Voto x questão x
eleitor em `Voto`. Presença em `Presenca`. Auditoria em `LogAuditoria`.

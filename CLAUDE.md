# App Votação

## Check-up

- Suíte: `bash verificacao/checkup.sh` (da raiz). `PROD_SSH=usuario@host` confere o schema no banco de produção; sem ele o passo sai como "NÃO VERIFICADO".
- Com o Docker ligado, a suíte sobe um Postgres 16 (igual à produção), roda migrações e testes nele e faz o teste com rostos reais (`verificacao/rosto_real.js`): fotos de amostra do face-api viram a câmera do Chromium, e o cadastro antecipado, a lista de presença e a entrada na votação rodam nas telas compiladas. Precisa das portas 8000 e 3998 livres.
- Em seguida rodam as telas (`verificacao/telas.js`, dados em `telas_dados.py`): o painel criando listas e assembleias e os moradores registrando presença, votando, emitindo comprovante e importando planilha. Fora do check-up: `BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_SENHA=... CONDOMINIO="..." node verificacao/telas.js [listas|votacao|cadastro|planilha|todas]`.
- Rotas sem login ficam listadas em `verificacao/rotas_publicas.txt`; rota pública nova só entra ali depois de conferida a guarda interna (token, segredo ou UUID + limite por IP).
- Isolamento entre condomínios e ponta a ponta de cada função ficam nos `tests.py` dos apps do backend. Função nova entra junto com o seu teste, cobrindo também o que deve ser recusado.
- Deploy (`push` na `master`) sobe o código novo antes do `migrate`: nunca publicar com assembleia ou lista de presença em andamento.

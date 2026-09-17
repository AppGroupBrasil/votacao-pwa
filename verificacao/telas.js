// Teste das telas, clicando como o síndico e os moradores (câmera simulada).
//
//   node verificacao/telas.js [listas|votacao|cadastro|planilha|todas]
//
// BASE_URL (padrão http://localhost:3998) é o frontend; API_URL (padrão
// http://localhost:8000/api) o backend. ADMIN_EMAIL, ADMIN_SENHA e CONDOMINIO
// vêm de verificacao/telas_dados.py (semear); o condomínio precisa ter 20
// unidades. Tudo o que o teste cria é apagado no fim de cada fase.
const fs = require("fs");
const os = require("os");
const path = require("path");

const FRONT = path.resolve(__dirname, "..", "frontend");
const { chromium } = require(path.join(FRONT, "node_modules", "@playwright", "test"));
const BASE = process.env.BASE_URL || "http://localhost:3998";
const API = process.env.API_URL || "http://localhost:8000/api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "checkup@teste.local";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "123456";
const CONDOMINIO = process.env.CONDOMINIO || "Condomínio Checkup Telas";
const TMP = path.join(os.tmpdir(), "votacao-telas");
fs.mkdirSync(TMP, { recursive: true });
const sufixo = Date.now().toString().slice(-5);

function falhar(msg) {
  console.error(`FALHOU: ${msg}`);
  process.exit(1);
}
const log = (m) => console.log(`   ${m}`);

async function esperar(page, locator, nome, timeout = 30000) {
  try {
    await locator.first().waitFor({ timeout });
  } catch {
    const arquivo = path.join(TMP, `falha-${nome.replace(/\W+/g, "-")}.png`);
    await page.screenshot({ path: arquivo, fullPage: true }).catch(() => {});
    const texto = await page.evaluate(() => document.body.innerText).catch(() => "");
    falhar(`${nome}: não apareceu. Tela: ${texto.replace(/\s+/g, " ").slice(0, 300)} (${arquivo})`);
  }
}

// Câmera de mentira: um quadro liso. Não tem rosto; a tela da biometria cai
// na "presença pela foto", que é o caminho testado aqui (o rosto de verdade
// fica com verificacao/rosto_real.js).
async function contextoMorador(browser, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 400, height: 860 },
    permissions: ["camera"],
    ...extra,
  });
  await ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 640;
      const g = c.getContext("2d");
      const pintar = () => {
        g.fillStyle = "#c9a27e";
        g.fillRect(0, 0, 480, 640);
        requestAnimationFrame(pintar);
      };
      pintar();
      return c.captureStream(15);
    };
    // Compartilhamento do celular: guarda o que a tela mandou compartilhar.
    window.__compartilhado = null;
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => {
      window.__compartilhado = {
        url: d.url || "",
        arquivos: (d.files || []).map((f) => ({ nome: f.name, tipo: f.type, tamanho: f.size })),
      };
    };
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  return { ctx, page };
}

async function fecharCookies(page) {
  const b = page.getByRole("button", { name: "Entendi" });
  if (await b.isVisible().catch(() => false)) await b.click();
}

async function assinar(page) {
  const canvas = page.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + 30 + i * 15, box.y + 40 + (i % 2 ? 30 : 0));
  }
  await page.mouse.up();
}

async function painel(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    window.__impressoes = 0;
    window.print = () => {
      window.__impressoes += 1;
    };
  });
  const page = await ctx.newPage();
  const dialogos = [];
  page.on("dialog", (d) => {
    dialogos.push(d.message());
    d.accept();
  });
  await page.goto(`${BASE}/login`);
  await fecharCookies(page);
  await page.locator('input[type="text"]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_SENHA);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 60000 }).catch(() => falhar("login do painel"));
  return { ctx, page, dialogos, api: page.request };
}

async function json(resposta, nome) {
  if (!resposta.ok()) falhar(`${nome}: HTTP ${resposta.status()}`);
  return resposta.json();
}

// ------------------------------------------------------------------ listas

async function faseListas(browser) {
  const adm = await painel(browser);
  const pa = adm.page;
  await pa.goto(`${BASE}/admin/listas-presenca`);
  const nova = pa.getByRole("button", { name: "Nova lista" });
  await esperar(pa, nova, "tela de listas", 60000);

  await nova.click();
  await pa.getByPlaceholder("Ex.: Assembleia ordinária 06/2026").fill("Sem modo");
  await pa.getByRole("button", { name: "Criar e gerar link" }).click();
  await pa.waitForTimeout(500);
  if (!adm.dialogos.some((m) => m.includes("Escolha como os moradores"))) falhar("criou lista sem escolher o modo");
  await pa.getByRole("button", { name: "Cancelar" }).click();
  log("nova lista sem escolher o modo: recusada");

  const criar = async (modo, titulo) => {
    await nova.click();
    await pa.locator("select").first().selectOption(CONDOMINIO);
    await pa.getByPlaceholder("Ex.: Assembleia ordinária 06/2026").fill(titulo);
    await pa.getByRole("button", { name: new RegExp(modo) }).click();
    await pa.getByRole("button", { name: "Criar e gerar link" }).click();
    await esperar(pa, pa.getByRole("heading", { name: titulo }), `lista ${titulo}`);
  };
  const tManual = `Telas Manual ${sufixo}`;
  const tBio = `Telas Biometria ${sufixo}`;
  await criar("Manual", tManual);
  await criar("Biometria facial", tBio);
  const card = (t) => pa.locator(".card", { has: pa.getByRole("heading", { name: t }) });
  if (!(await card(tManual).getByText("Manual", { exact: true }).isVisible())) falhar("selo Manual");
  if (!(await card(tBio).getByText("Biometria facial").isVisible())) falhar("selo Biometria facial");
  const href = async (t, nome) => card(t).getByRole("link", { name: nome }).getAttribute("href");
  const linkManual = await href(tManual, /Abrir lista/);
  const linkBio = await href(tBio, /Abrir lista/);
  const verManual = await href(tManual, /Ver presenças/);
  const verBio = await href(tBio, /Ver presenças/);
  log("listas criadas pelos cards, com o selo do modo");

  // Morador na lista manual.
  const m1 = await contextoMorador(browser);
  const pm = m1.page;
  await pm.goto(linkManual);
  await pm.waitForURL(/\/presenca\//, { timeout: 60000 });
  await fecharCookies(pm);
  await pm.getByPlaceholder("Ex.: Maria de Souza").fill("Carlos Procurador");
  await pm.getByPlaceholder("000.000.000-00").fill("111.111.111-11");
  await pm.getByPlaceholder("Ex.: 101").fill("302");
  await pm.getByPlaceholder(/sou procurador/).fill("Sou procurador do 302. Efetuei o pagamento hoje.");
  await pm.getByRole("button", { name: "Continuar" }).click();
  await esperar(pm, pm.getByText("Confira o CPF"), "CPF inválido recusado", 5000);
  await pm.getByPlaceholder("000.000.000-00").fill("529.982.247-25");
  await pm.getByRole("button", { name: "Continuar" }).click();
  await pm.getByRole("button", { name: "Tirar foto" }).click({ timeout: 20000 });
  await pm.getByRole("button", { name: "Continuar" }).click();
  await esperar(pm, pm.getByText("Assine conforme a sua assinatura."), "texto da assinatura", 5000);
  await assinar(pm);
  await pm.locator('input[type="checkbox"]').first().check();
  await pm.getByRole("button", { name: "Registrar presença" }).click();
  await esperar(pm, pm.getByRole("heading", { name: "Presença registrada" }), "presença manual");
  if (await pm.getByText("Registrar outra pessoa").count()) falhar('ainda existe "Registrar outra pessoa"');
  await esperar(pm, pm.getByText("1 presença registrada"), "contador do topo", 5000);
  log("lista manual: CPF inválido recusado, presença registrada, contador atualizado");

  await pm.getByRole("button", { name: "Emitir comprovante de presença" }).click();
  for (const t of [
    "Comprovante de presença", "Carlos Procurador", "***.982.247-**", "Apto 302",
    "Sou procurador do 302. Efetuei o pagamento hoje.", "Endereço de rede (IP)",
  ]) {
    await esperar(pm, pm.getByText(t, { exact: false }), `comprovante com ${t}`, 5000);
  }
  await esperar(pm, pm.getByAltText("Sua assinatura"), "assinatura no comprovante", 5000);
  await esperar(pm, pm.getByAltText("Sua foto"), "foto no comprovante", 5000);
  const hrefPdf = await pm.getByRole("link", { name: "Baixar / imprimir PDF" }).getAttribute("href");
  const pdf = await pm.request.get(hrefPdf);
  if (pdf.status() !== 200 || !(await pdf.body()).subarray(0, 4).equals(Buffer.from("%PDF"))) {
    falhar(`PDF do comprovante: HTTP ${pdf.status()}`);
  }
  await pm.waitForTimeout(1500); // o PDF é baixado de antemão para o compartilhamento
  await pm.getByRole("button", { name: "Compartilhar" }).click();
  const compartilhado = await pm.evaluate(() => window.__compartilhado);
  const arquivo = compartilhado && compartilhado.arquivos[0];
  if (!arquivo || arquivo.tipo !== "application/pdf" || arquivo.tamanho < 1000) {
    falhar(`Compartilhar não mandou o PDF: ${JSON.stringify(compartilhado)}`);
  }
  log(`comprovante na tela, PDF baixado e compartilhado como arquivo (${arquivo.tamanho} bytes)`);

  const repetir = async (page, nome) => {
    await page.goto(linkManual);
    await page.waitForURL(/\/presenca\//, { timeout: 60000 });
    await fecharCookies(page);
    await page.getByPlaceholder("Ex.: Maria de Souza").fill(nome);
    await page.getByPlaceholder("000.000.000-00").fill("52998224725");
    await page.getByPlaceholder("Ex.: 101").fill("302");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Tirar foto" }).click({ timeout: 20000 });
    await page.getByRole("button", { name: "Continuar" }).click();
    await assinar(page);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Registrar presença" }).click();
    await esperar(page, page.getByText("Você já está presente"), `repetição (${nome})`);
  };
  await repetir(pm, "Carlos P.");
  if (!(await pm.getByRole("link", { name: "Baixar / imprimir PDF" }).isVisible())) falhar("mesmo aparelho sem o PDF");
  const m2 = await contextoMorador(browser);
  await repetir(m2.page, "Impostor");
  if (await m2.page.getByRole("link", { name: /Baixar/ }).count()) falhar("outro aparelho recebeu o comprovante");
  log("mesmo CPF e unidade: não registra de novo; comprovante só no aparelho que registrou");

  // Morador na lista por biometria (condomínio sem planilha).
  const m3 = await contextoMorador(browser);
  const pb = m3.page;
  await pb.goto(linkBio);
  await pb.waitForURL(/\/presenca-manual\//, { timeout: 60000 });
  await fecharCookies(pb);
  await esperar(pb, pb.getByPlaceholder("000.000.000-00"), "CPF no formulário da biometria");
  await pb.getByRole("button", { name: "Abrir câmera" }).click();
  await pb.getByRole("button", { name: /Capturar agora/ }).click({ timeout: 20000 });
  await esperar(pb, pb.getByRole("button", { name: "Tirar outra" }), "foto da biometria", 180000);
  const campos = pb.locator(".card input:not([type=checkbox])");
  await campos.nth(0).fill("Joana Biometria");
  await pb.getByPlaceholder("000.000.000-00").fill("529.982.247-25");
  await campos.nth(3).fill("101");
  await pb.getByPlaceholder(/sou procurador/).fill("Cheguei atrasada.");
  await esperar(pb, pb.getByText("Assine conforme a sua assinatura."), "texto da assinatura (biometria)", 5000);
  await assinar(pb);
  await pb.locator('input[type="checkbox"]').first().check();
  await pb.getByRole("button", { name: "Confirmar presença" }).click();
  await esperar(pb, pb.getByText(/Presença registrada|Você já está presente/), "presença por biometria");
  log("lista por biometria: CPF e observações no formulário, presença registrada");

  await pa.goto(`${BASE}${verManual}`);
  await esperar(pa, pa.getByText("CPF ***.982.247-**"), "CPF mascarado no painel (manual)");
  await esperar(pa, pa.getByText("Sou procurador do 302. Efetuei o pagamento hoje."), "observação no painel (manual)", 5000);
  if ((await pa.getByText("Carlos").count()) !== 1) falhar("registro repetido na lista manual");
  await pa.goto(`${BASE}${verBio}`);
  await esperar(pa, pa.getByText("Cheguei atrasada."), "observação no painel (biometria)");
  const corpo = await pa.evaluate(() => document.body.innerText);
  if (corpo.includes("52998224725") || corpo.includes("529.982.247-25")) falhar("CPF inteiro no painel");
  log("painel: CPF mascarado e observações nas duas listas, sem CPF inteiro");

  const listas = await json(await adm.api.get(`${API}/enquetes/listas-presenca/`), "listas");
  for (const l of listas.results || listas) {
    if (l.titulo.startsWith(`Telas `) && l.titulo.endsWith(sufixo)) {
      await adm.api.delete(`${API}/enquetes/listas-presenca/${l.id}/`);
    }
  }
  for (const c of [m1, m2, m3, adm]) await c.ctx.close();
}

// ----------------------------------------------------------------- votação

const Q1 = "Aprovação das contas de 2025";
const Q2 = "Cor da nova pintura da fachada";
const VOTANTES = [
  { nome: "Ana Lima", bloco: "A", apto: "101", votos: ["Sim", "Azul"] },
  { nome: "Bruno Castro", bloco: "A", apto: "102", votos: ["Sim", "Verde"] },
  { nome: "Carla Dias", bloco: "B", apto: "201", votos: ["Não", "Azul"] },
  { nome: "Diego Rocha", bloco: "B", apto: "202", votos: ["Sim", "Azul"] },
  { nome: "Elisa Prado", bloco: "B", apto: "203", votos: ["Abstenção", "Verde"] },
];

async function entrarNaVotacao(browser, link, v, existente) {
  const s = existente ? { ctx: existente.ctx, page: await existente.ctx.newPage() } : await contextoMorador(browser);
  const p = s.page;
  await p.goto(link);
  await fecharCookies(p);
  await p.getByRole("button", { name: /tirar só a\s+selfie/ }).click({ timeout: 60000 });
  // Campos: nome, CPF (opcional), bloco, apartamento.
  const campos = p.locator("input");
  await campos.nth(0).fill(v.nome);
  if (v.cpf) await campos.nth(1).fill(v.cpf);
  await campos.nth(2).fill(v.bloco);
  await campos.nth(3).fill(v.apto);
  await p.getByRole("button", { name: "Abrir câmera" }).click();
  await p.getByRole("button", { name: "Capturar" }).click({ timeout: 20000 });
  await p.getByRole("button", { name: "Entrar e votar" }).click();
  return { ctx: s.ctx, page: p };
}

function conferirApuracao(resultados, esperado, etapa) {
  for (const [titulo, contagem] of Object.entries(esperado)) {
    const q = resultados.find((x) => x.questao_titulo === titulo);
    if (!q) falhar(`${etapa}: pergunta ${titulo} sumiu`);
    for (const [opcao, n] of Object.entries(contagem)) {
      const o = q.opcoes.find((x) => x.texto === opcao);
      if (!o || o.votos !== n) falhar(`${etapa}: ${titulo} / ${opcao} = ${o && o.votos}, esperado ${n}`);
    }
  }
}

async function faseVotacao(browser) {
  const adm = await painel(browser);
  const pa = adm.page;
  const titulo = `AGO Telas ${sufixo}`;
  await pa.goto(`${BASE}/admin/assembleias/nova-simples`);
  await pa.getByPlaceholder("Ex.: Residencial Jardins").fill(CONDOMINIO);
  await pa.getByPlaceholder("Ex.: Assembleia Geral Ordinária").fill(titulo);
  await pa.getByRole("button", { name: "Criar e gerar link" }).click();
  await esperar(pa, pa.getByText("Crie ao menos uma questão"), "assembleia sem pergunta recusada", 5000);
  const bloco1 = pa.locator("div.rounded-xl", { has: pa.getByPlaceholder("Pergunta 1") });
  await pa.getByPlaceholder("Pergunta 1").fill(Q1);
  await bloco1.getByPlaceholder("Resposta 1").fill("Sim");
  await bloco1.getByPlaceholder("Resposta 2").fill("Não");
  await bloco1.getByRole("button", { name: "Adicionar resposta" }).click();
  await bloco1.getByPlaceholder("Resposta 3").fill("Abstenção");
  await pa.getByRole("button", { name: "Adicionar questão" }).click();
  const bloco2 = pa.locator("div.rounded-xl", { has: pa.getByPlaceholder("Pergunta 2") });
  await pa.getByPlaceholder("Pergunta 2").fill(Q2);
  await bloco2.getByPlaceholder("Resposta 1").fill("Azul");
  await bloco2.getByPlaceholder("Resposta 2").fill("Verde");
  await pa.getByRole("button", { name: "Criar e gerar link" }).click();
  const card = pa.locator("div.rounded-2xl", { has: pa.getByRole("heading", { name: titulo }) });
  await esperar(pa, card, "card da assembleia criada");
  const link = await card.getByRole("link", { name: "Ver página" }).getAttribute("href");
  const id = (await card.getByRole("link", { name: "Gerenciar" }).getAttribute("href")).split("/").pop();
  const det = await json(await adm.api.get(`${API}/assembleias/${id}/`), "assembleia");
  const gravadas = det.questoes.map((q) => `${q.ordem}:${q.titulo}[${q.opcoes.map((o) => o.texto).join("/")}]`).join("|");
  if (gravadas !== `1:${Q1}[Sim/Não/Abstenção]|2:${Q2}[Azul/Verde]`) falhar(`perguntas gravadas: ${gravadas}`);
  log("assembleia criada; sem pergunta é recusada; perguntas e respostas na ordem certa");

  const antes = await entrarNaVotacao(browser, link, { nome: "Apressado", bloco: "C", apto: "301" });
  await esperar(antes.page, antes.page.getByText("não está aberta"), "entrada antes de abrir recusada");
  await antes.ctx.close();
  await card.getByRole("button", { name: "Abrir assembleia" }).click();
  await esperar(pa, card.getByRole("button", { name: "Fechar assembleia" }), "assembleia aberta");

  const sessoes = [];
  for (const v of VOTANTES) {
    const s = await entrarNaVotacao(browser, link, v);
    for (const escolha of v.votos) {
      await esperar(s.page, s.page.getByRole("button", { name: "Confirmar Voto" }), `cédula de ${v.nome}`);
      await s.page.getByRole("button", { name: escolha, exact: true }).click();
      await s.page.getByRole("button", { name: "Confirmar Voto" }).click();
    }
    await esperar(s.page, s.page.getByRole("heading", { name: "Voto Registrado!" }), `voto de ${v.nome}`);
    sessoes.push(s);
  }
  const esperado = { [Q1]: { Sim: 3, "Não": 1, "Abstenção": 1 }, [Q2]: { Azul: 3, Verde: 2 } };
  const resultados = async () => json(await adm.api.get(`${API}/votos/${id}/resultados/`), "resultados");
  conferirApuracao(await resultados(), esperado, "após os 5 votos");
  log("5 moradores votaram: Sim 3 / Não 1 / Abstenção 1 · Azul 3 / Verde 2");

  const fabio = await entrarNaVotacao(browser, link, { nome: "Fabio Lima", bloco: "A", apto: "101" });
  await esperar(fabio.page, fabio.page.getByRole("heading", { name: /Já existe um voto para esta unidade/ }), "mesma unidade bloqueada");
  const bruno = await entrarNaVotacao(browser, link, VOTANTES[1], sessoes[1]);
  await esperar(bruno.page, bruno.page.getByRole("heading", { name: /Já existe um voto|Voto Registrado/ }), "morador voltando");
  conferirApuracao(await resultados(), esperado, "após as tentativas");
  log("segunda pessoa da unidade e morador voltando: nada conta de novo");

  // ---- Resultado ao vivo para o morador (chave do síndico) --------------
  // Numa aba à parte: a página de criar assembleia continua aberta em `pa`,
  // é dela que saem os cliques de abrir e fechar a assembleia.
  const pr = await adm.ctx.newPage();
  await pr.goto(`${BASE}/admin/assembleias?tab=resultados&id=${id}`);
  const chave = pr.getByRole("switch");
  await esperar(pr, chave, "chave do resultado ao vivo");
  if ((await chave.getAttribute("aria-checked")) !== "false") {
    falhar("a chave do resultado ao vivo devia nascer desligada");
  }
  const morador = await contextoMorador(browser);
  await morador.page.goto(`${BASE}/resultado/${id}`);
  await esperar(morador.page, morador.page.getByText("ainda não foi liberado"), "resultado trancado");
  let visto = await morador.page.evaluate(() => document.body.innerText);
  for (const t of ["3 votos", "60%", "Sim"]) {
    if (visto.includes(t)) falhar(`resultado trancado vazando "${t}"`);
  }

  await chave.click();
  await esperar(pr, pr.getByRole("button", { name: "Copiar link" }), "link do resultado no painel");
  await morador.page.reload();
  await esperar(morador.page, morador.page.getByRole("heading", { name: Q1 }), "placar do morador");
  visto = await morador.page.evaluate(() => document.body.innerText);
  for (const t of ["3 votos (60%)", "1 voto (20%)", "em votação", "5 votos"]) {
    if (!visto.includes(t)) falhar(`placar do morador sem: ${t}`);
  }
  // Só o texto dos cartões do placar: o rodapé traz o relógio da última
  // atualização, e "20:20:2..." casaria por acaso com o apartamento 202.
  const placar = await morador.page.evaluate(() =>
    [...document.querySelectorAll(".card")].map((c) => c.innerText).join(" | ")
  );
  // Palavras soltas do placar, para conferir unidade sem casar pedaço de
  // número ("202" dentro de outro texto).
  const palavras = placar.split(/[^0-9A-Za-zÀ-ÿ]+/);
  for (const v of VOTANTES) {
    if (placar.includes(v.nome)) falhar(`placar do morador com o nome de quem votou: ${v.nome}`);
    if (palavras.includes(v.apto)) {
      falhar(`placar do morador com a unidade de quem votou: ${v.apto}`);
    }
  }
  if (visto.includes("ver quem votou")) falhar("placar do morador com a lista de votantes");

  await chave.click();
  await esperar(pr, chave, "chave de volta");
  await morador.page.reload();
  await esperar(morador.page, morador.page.getByText("ainda não foi liberado"), "resultado trancado de novo");
  await morador.ctx.close();
  log("resultado ao vivo: nasce trancado, libera com a chave, sem nomes, e tranca de novo");

  // ---- Resumo das votações (cards por assembleia) -----------------------
  await pr.goto(`${BASE}/admin/resumo`);
  const linhaResumo = pr.locator("div.card", { has: pr.getByRole("heading", { name: titulo }) });
  await esperar(pr, linhaResumo, "assembleia no resumo");
  const cabecalho = await linhaResumo.innerText();
  for (const t of ["Em votação", String(new Date().getFullYear())]) {
    if (!cabecalho.includes(t)) falhar(`resumo sem "${t}" no cabeçalho da assembleia`);
  }
  await linhaResumo.getByRole("heading", { name: titulo }).click();
  await esperar(pr, linhaResumo.getByText("Lista de presença"), "cards do resumo");
  await esperar(pr, linhaResumo.getByText("Resultado parcial"), "resultado parcial no resumo");
  const resumoAberto = await linhaResumo.innerText();
  for (const t of [Q1, Q2, "3 (60%)", "1 (20%)", "À frente: Sim", "Abrir a lista"]) {
    if (!resumoAberto.includes(t)) falhar(`resumo sem: ${t}`);
  }
  if (resumoAberto.includes("Resultado final")) {
    falhar("resumo mostrando resultado final antes de encerrar");
  }
  log("resumo: data e situação no cabeçalho, presença, perguntas e parcial (Sim 60%)");

  await card.getByRole("button", { name: "Fechar assembleia" }).click();
  await esperar(pa, card.getByRole("button", { name: "Abrir assembleia" }), "assembleia fechada");
  const tarde = await entrarNaVotacao(browser, link, { nome: "Atrasado", bloco: "C", apto: "302" });
  await esperar(tarde.page, tarde.page.getByText("não está aberta"), "entrada depois de fechar recusada");

  // Encerrada, o resumo troca a parcial pelo resultado final.
  await pr.goto(`${BASE}/admin/resumo`);
  await esperar(pr, linhaResumo, "assembleia no resumo depois de encerrar");
  await linhaResumo.getByRole("heading", { name: titulo }).click();
  await esperar(pr, linhaResumo.getByText("Resultado final"), "resultado final no resumo");
  const resumoFinal = await linhaResumo.innerText();
  for (const t of ["Encerrada", "Vencedora: Sim", "Vencedora: Azul", "votação encerrada"]) {
    if (!resumoFinal.includes(t)) falhar(`resumo encerrado sem: ${t}`);
  }
  if (resumoFinal.includes("Resultado parcial")) falhar("resumo ainda em parcial depois de encerrar");

  // Os três relatórios saem do próprio resumo, cada um no seu card.
  const pdfsResumo = [];
  for (const rotulo of [
    "Relatório de presença",
    "Relatório de votação",
    "Relatório do resultado",
  ]) {
    const [download] = await Promise.all([
      pr.waitForEvent("download", { timeout: 60000 }),
      linhaResumo.getByRole("button", { name: rotulo }).click(),
    ]);
    const destino = path.join(TMP, download.suggestedFilename());
    await download.saveAs(destino);
    if (fs.readFileSync(destino).subarray(0, 4).toString() !== "%PDF") {
      falhar(`${rotulo} baixado no resumo não é PDF`);
    }
    pdfsResumo.push(download.suggestedFilename());
  }
  await pr.close();
  log(`resumo: encerrada, resultado final e os PDFs (${pdfsResumo.join(", ")})`);

  await pa.goto(`${BASE}/admin/assembleias?tab=resultados&id=${id}`);
  await esperar(pa, pa.getByRole("heading", { name: Q1 }), "tela de resultado");
  await pa.waitForTimeout(800);
  const tela = await pa.evaluate(() => document.body.innerText);
  for (const t of [
    "Vencedora: Sim (3 votos)", "Vencedora: Azul (3 votos)", "20 unidades aptas a votar",
    "5 votos · 0 abstenções · 25% de participação",
  ]) {
    if (!tela.includes(t)) falhar(`tela de resultado sem: ${t}`);
  }
  if (tela.includes("em votação")) falhar("pergunta em votação com a assembleia fechada");
  await pa.getByRole("button", { name: "Imprimir / PDF" }).click();
  if ((await pa.evaluate(() => window.__impressoes)) !== 1) falhar('"Imprimir / PDF" não abriu a impressão');
  log("resultado: fechada, vencedoras, 20 unidades, 25%; Imprimir abre a impressão");

  await pa.goto(`${BASE}/admin/assembleias?tab=relatorio&id=${id}`);
  const botoes = pa.getByRole("button", { name: "Baixar em PDF" });
  await esperar(pa, botoes, "botões dos relatórios");
  const baixados = [];
  for (let i = 0; i < 3; i++) {
    const [download] = await Promise.all([pa.waitForEvent("download", { timeout: 60000 }), botoes.nth(i).click()]);
    const destino = path.join(TMP, download.suggestedFilename());
    await download.saveAs(destino);
    const inicio = fs.readFileSync(destino).subarray(0, 4).toString();
    if (inicio !== "%PDF") falhar(`${download.suggestedFilename()} não é PDF`);
    baixados.push(download.suggestedFilename());
    await esperar(pa, botoes.nth(i), "botão liberado", 30000);
  }
  const tipos = baixados.map((n) => n.split("-")[0]).sort().join(",");
  if (tipos !== "presenca,resultado,votacao") falhar(`relatórios baixados: ${baixados.join(", ")}`);
  log(`botões "Baixar em PDF": ${baixados.join(", ")}`);

  await adm.api.delete(`${API}/assembleias/${id}/`);
  for (const s of [...sessoes, fabio, tarde, adm]) await s.ctx.close().catch(() => {});
}

// ---------------------------------------------------------------- cadastro

async function faseCadastro(browser) {
  const adm = await painel(browser);
  const pa = adm.page;
  const cond = await json(
    await adm.api.post(`${API}/condominios/`, {
      data: { nome: `Condomínio Telas ${sufixo}`, cnpj: `SIMPLES-${Date.now()}`.slice(0, 18), total_unidades: 0, blocos: [] },
    }),
    "criar condomínio"
  );
  await pa.goto(`${BASE}/admin/condominios/${cond.id}/editar`);
  const total = pa.locator('input[type="number"]');
  await esperar(pa, total, "edição do condomínio");
  await total.fill("48");
  await pa.getByRole("button", { name: "Salvar" }).click();
  await pa.waitForURL(/\/admin\/condominios$/, { timeout: 30000 }).catch(() => falhar("condomínio não salvou"));
  const salvo = await json(await adm.api.get(`${API}/condominios/${cond.id}/`), "condomínio");
  if (salvo.total_unidades !== 48) falhar(`total de unidades salvo: ${salvo.total_unidades}`);
  log("condomínio criado na hora: total de unidades editado e salvo (48)");

  const agora = new Date();
  const asm = await json(
    await adm.api.post(`${API}/assembleias/`, {
      data: {
        condominio: cond.id, titulo: `AGE Telas ${sufixo}`, descricao: "",
        data_inicio: agora.toISOString(), data_fim: new Date(agora.getTime() + 4 * 3600e3).toISOString(),
        quorum_minimo: 50, primeira_chamada_50_mais_1: true, quorum_segunda_chamada: 33,
        segunda_chamada_qualquer_numero: true, exigir_confirmacao_email: false,
      },
    }),
    "criar assembleia"
  );
  await json(
    await adm.api.post(`${API}/assembleias/${asm.id}/questoes/`, {
      multipart: {
        titulo: "Aprovar obra", descricao: "", ordem: "1",
        opcoes_json: JSON.stringify([{ texto: "Sim", ordem: 1 }, { texto: "Não", ordem: 2 }]),
      },
    }),
    "criar pergunta"
  );
  await json(await adm.api.post(`${API}/assembleias/${asm.id}/abrir/`), "abrir");

  const m = await contextoMorador(browser);
  const p = m.page;
  await p.goto(`${BASE}/votacao/${asm.id}`);
  await fecharCookies(p);
  await p.getByRole("button", { name: /tirar só a\s+selfie/ }).click({ timeout: 60000 });
  const campos = p.locator("input");
  const entrar = p.getByRole("button", { name: "Entrar e votar" });
  await entrar.click();
  await esperar(p, p.getByText("Informe o seu nome completo."), "nome obrigatório", 5000);
  await campos.nth(0).fill("Rosa Maria");
  await entrar.click();
  await esperar(p, p.getByText("Informe o apartamento/unidade."), "apartamento obrigatório", 5000);
  await campos.nth(2).fill("Bloco A - Edifício Primavera");
  await campos.nth(3).fill("Apartamento 1201 fundos");
  if ((await campos.nth(2).inputValue()).length > 20) falhar("campo bloco aceitou mais de 20 letras");
  await entrar.click();
  // CPF é opcional: em branco passa direto para a exigência da selfie.
  await esperar(p, p.getByText("A selfie é obrigatória para votar."), "selfie obrigatória", 5000);
  await campos.nth(1).fill("111.111.111-11");
  await entrar.click();
  await esperar(p, p.getByText(/CPF inválido/), "CPF digitado errado", 5000);
  await campos.nth(1).fill("529.982.247-25");
  await p.getByRole("button", { name: "Abrir câmera" }).click();
  await p.getByRole("button", { name: "Capturar" }).click({ timeout: 20000 });
  await entrar.click();
  await p.getByRole("button", { name: "Sim", exact: true }).click({ timeout: 30000 });
  await p.getByRole("button", { name: "Confirmar Voto" }).click();
  await esperar(p, p.getByRole("heading", { name: "Voto Registrado!" }), "voto com bloco longo");
  const res = await json(await adm.api.get(`${API}/votos/${asm.id}/resultados/`), "resultados");
  if (res[0].total_votos !== 1 || res[0].base_unidades !== 48) falhar(`apuração: ${JSON.stringify(res[0])}`);
  const manuais = await json(await adm.api.get(`${API}/votos/${asm.id}/votos-manuais/`), "votos manuais");
  if (manuais.votantes[0]?.cpf_mascarado !== "***.982.247-**") falhar(`CPF no painel: ${JSON.stringify(manuais.votantes[0]?.cpf_mascarado)}`);
  log("cadastro na hora: sem nome, apartamento ou selfie é recusado; CPF opcional, errado é recusado e certo chega mascarado ao painel; bloco longo entra e vota");

  await adm.api.post(`${API}/assembleias/${asm.id}/encerrar/`);
  await adm.api.delete(`${API}/assembleias/${asm.id}/`);
  await adm.api.delete(`${API}/condominios/${cond.id}/`);
  for (const c of [m, adm]) await c.ctx.close();
}

// ---------------------------------------------------------------- planilha

async function fasePlanilha(browser) {
  const adm = await painel(browser);
  const pa = adm.page;
  const nomeCond = `Condominio Planilha ${sufixo}`;
  const titulo = `AGO Planilha ${sufixo}`;
  const moradores = [
    "nome,cpf,bloco,apartamento,email",
    "Ana Planilha,529.982.247-25,A,101,ana@exemplo.com",
    "Bruno Planilha,111.444.777-35,A,102,",
    "Carla Planilha,123.456.789-09,B,201,nao-e-email",
  ].join("\n");
  const inadimplentes = "bloco,apartamento\nA,102";

  const importar = async () => {
    await pa.goto(`${BASE}/admin/listas-presenca`);
    await pa.getByRole("button", { name: "Importar planilha" }).click();
    const select = pa.locator("select").first();
    if (await select.isVisible().catch(() => false)) {
      const opcoes = await select.locator("option").allTextContents();
      if (opcoes.includes(nomeCond)) await select.selectOption(nomeCond);
      else await select.selectOption("__novo__");
    }
    const novo = pa.getByPlaceholder("Ex.: San Residence");
    if (await novo.isVisible().catch(() => false)) await novo.fill(nomeCond);
    await pa.getByPlaceholder("Ex.: Assembleia ordinária 06/2026").fill(titulo);
    const arquivos = pa.locator('input[type="file"]');
    await arquivos.nth(0).setInputFiles({ name: "moradores.csv", mimeType: "text/csv", buffer: Buffer.from(moradores) });
    await arquivos.nth(1).setInputFiles({ name: "inadimplentes.csv", mimeType: "text/csv", buffer: Buffer.from(inadimplentes) });
    const antes = adm.dialogos.length;
    await pa.getByRole("button", { name: "Importar e criar" }).click();
    await pa.waitForURL(/\/admin\/assembleias\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() =>
      falhar(`importação não abriu a assembleia: ${adm.dialogos.slice(antes).join(" | ")}`)
    );
    return { aviso: adm.dialogos.slice(antes).join("\n"), assembleia: pa.url().split("/").pop() };
  };

  const primeira = await importar();
  for (const t of [
    "2 morador(es) importado(s)", "1 unidade(s) marcada(s) como inadimplente",
    "1 linha(s) não importada(s) por dado inválido: 4",
  ]) {
    if (!primeira.aviso.includes(t)) falhar(`aviso da importação sem "${t}": ${primeira.aviso}`);
  }
  log("importação: 2 moradores, 1 inadimplente, linha 4 (e-mail inválido) avisada");
  const segunda = await importar();
  if (!segunda.aviso.includes("0 morador(es) importado(s), 2 já existiam")) {
    falhar(`reimportação: ${segunda.aviso}`);
  }
  log("reimportar a mesma planilha: 2 já existiam, ninguém duplicado");

  const listas = await json(await adm.api.get(`${API}/enquetes/listas-presenca/`), "listas");
  const lista = (listas.results || listas).find((l) => l.titulo === titulo && l.condominio_nome === nomeCond);
  if (!lista || lista.modo_rapido) falhar("lista por biometria da importação não encontrada");

  const presenca = async (cpf, dados) => {
    const m = await contextoMorador(browser);
    const p = m.page;
    await p.goto(`${BASE}/presenca-manual/${lista.id}`);
    await fecharCookies(p);
    await p.getByPlaceholder("000.000.000-00").fill(cpf);
    await p.getByRole("button", { name: "Continuar" }).click();
    if (dados) {
      await p.getByRole("button", { name: "Preencher meus dados e continuar" }).click({ timeout: 30000 });
      await p.getByPlaceholder("Como está no seu documento").fill(dados.nome);
      await p.getByPlaceholder("305").fill(dados.apto);
      await p.getByRole("button", { name: "Continuar" }).click();
    } else {
      await esperar(p, p.getByText("Ana Planilha"), "planilha trouxe o nome pelo CPF");
      await p.getByRole("button", { name: "Sim, sou eu" }).click();
    }
    if (await p.getByPlaceholder("000.000.000-00").count()) falhar("CPF pedido de novo depois do portão");
    await p.getByRole("button", { name: "Abrir câmera" }).click();
    await p.getByRole("button", { name: /Capturar agora/ }).click({ timeout: 20000 });
    await esperar(p, p.getByRole("button", { name: "Tirar outra" }), "foto", 180000);
    await p.getByPlaceholder(/sou procurador/).fill(dados ? "Sou procuradora." : "Proprietária.");
    await assinar(p);
    await p.locator('input[type="checkbox"]').first().check();
    await p.getByRole("button", { name: "Confirmar presença" }).click();
    await esperar(p, p.getByText("Presença registrada!"), `presença de ${dados ? dados.nome : "Ana"}`);
    await m.ctx.close();
  };
  await presenca("529.982.247-25");
  await presenca("390.533.447-05", { nome: "Paula Fora", apto: "103" });
  const registros = await json(await adm.api.get(`${API}/enquetes/listas-presenca/${lista.id}/registros/`), "registros");
  const porNome = Object.fromEntries(registros.map((r) => [r.nome, r]));
  const ana = porNome["Ana Planilha"];
  const paula = porNome["Paula Fora"];
  if (!ana || ana.cpf_mascarado !== "***.982.247-**" || ana.observacao !== "Proprietária.") {
    falhar(`registro da Ana: ${JSON.stringify(ana)}`);
  }
  if (!paula || paula.cpf_mascarado !== "***.533.447-**" || !paula.conferir_na_mesa || paula.motivo_conferencia !== "sem_cadastro") {
    falhar(`registro da Paula: ${JSON.stringify(paula)}`);
  }
  log("lista com planilha: CPF traz o morador; CPF fora da planilha entra com selo para a mesa");

  for (const a of [primeira.assembleia, segunda.assembleia]) await adm.api.delete(`${API}/assembleias/${a}/`);
  for (const l of listas.results || listas) {
    if (l.titulo === titulo) await adm.api.delete(`${API}/enquetes/listas-presenca/${l.id}/`);
  }
  const conds = await json(await adm.api.get(`${API}/condominios/`), "condomínios");
  for (const c of conds.results || conds) {
    if (c.nome === nomeCond) await adm.api.delete(`${API}/condominios/${c.id}/`);
  }
  await adm.ctx.close();
}

const fases = { listas: faseListas, votacao: faseVotacao, cadastro: faseCadastro, planilha: fasePlanilha };

(async () => {
  const escolha = process.argv[2] || "todas";
  const nomes = escolha === "todas" ? Object.keys(fases) : [escolha];
  if (nomes.some((n) => !fases[n])) falhar(`fase desconhecida: ${escolha}`);
  const browser = await chromium.launch();
  for (const nome of nomes) {
    console.log(`   -- ${nome}`);
    await fases[nome](browser);
  }
  await browser.close();
})().catch((e) => falhar(e.message.split("\n")[0]));

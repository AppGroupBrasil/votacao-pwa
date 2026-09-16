// Teste com rostos reais: fotos de amostra do próprio face-api viram o vídeo
// da câmera, e o reconhecimento roda de verdade no navegador (Chromium), nas
// telas de produção, contra o backend e o banco de teste.
//
//   node verificacao/rosto_real.js rostos
//   node verificacao/rosto_real.js cadastro <condominio_id>
//   node verificacao/rosto_real.js porta <assembleia_id>
//   node verificacao/rosto_real.js lista <lista_id> <lista_sem_planilha_id>
//
// BASE_URL (padrão http://localhost:3998) é o frontend já compilado.
const fs = require("fs");
const os = require("os");
const path = require("path");

const FRONT = path.resolve(__dirname, "..", "frontend");
const { chromium } = require(path.join(FRONT, "node_modules", "@playwright", "test"));
const TMP = path.join(os.tmpdir(), "votacao-rosto-real");
const BASE = process.env.BASE_URL || "http://localhost:3998";
const [fase, alvo, alvo2] = process.argv.slice(2);
fs.mkdirSync(TMP, { recursive: true });

// WebGL por software: sem isso o TensorFlow cai para CPU e cada leitura demora.
const lancar = () =>
  chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });

function falhar(msg) {
  console.error(`FALHOU: ${msg}`);
  process.exit(1);
}

async function comCamera(browser, foto) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, permissions: ["camera"] });
  await ctx.addInitScript((src) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 640;
      const g = c.getContext("2d");
      const desenhar = () => {
        g.drawImage(img, 0, 0, 480, 640);
        requestAnimationFrame(desenhar);
      };
      desenhar();
      return c.captureStream(15);
    };
  }, foto);
  const page = await ctx.newPage();
  const entendi = page.getByRole("button", { name: "Entendi" });
  page.fecharCookies = async () => {
    if (await entendi.isVisible().catch(() => false)) await entendi.click();
  };
  return { ctx, page };
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

async function esperar(page, locator, nome, timeout = 180000) {
  try {
    // .first(): texto que aparece em dois lugares da tela não é erro do teste.
    await locator.first().waitFor({ timeout });
  } catch {
    const arquivo = path.join(TMP, `falha-${nome}.png`);
    await page.screenshot({ path: arquivo, fullPage: true }).catch(() => {});
    const texto = await page.evaluate(() => document.body.innerText).catch(() => "");
    falhar(`${nome}: não apareceu a tempo. Tela: ${texto.replace(/\s+/g, " ").slice(0, 300)} (${arquivo})`);
  }
}

async function faseRostos() {
  const browser = await lancar();
  const page = await browser.newPage();
  await page.goto(`${BASE}/privacidade`);
  await page.addScriptTag({ path: path.join(FRONT, "node_modules/@vladmandic/face-api/dist/face-api.js") });
  const amostras = [1, 2, 3, 4, 5, 6].map(
    (i) =>
      "data:image/jpeg;base64," +
      fs.readFileSync(path.join(FRONT, `node_modules/@vladmandic/face-api/demo/sample${i}.jpg`)).toString("base64")
  );
  const r = await page.evaluate(async (amostras) => {
    const fa = window.faceapi;
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri("/models"),
      fa.nets.faceLandmark68Net.loadFromUri("/models"),
      fa.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    const carregar = async (src) => {
      const i = new Image();
      i.src = src;
      await i.decode();
      return i;
    };
    // Recorte retrato com o rosto centralizado, como numa selfie. As amostras
    // são fotos de grupo: fora de uma oval em volta do rosto fica cinza, senão
    // o rosto de quem está ao lado entra no quadro e o teste mede outra pessoa.
    const recortar = (img, box, { fracao = 0.42, brilho = 1, giro = 0 } = {}) => {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 640;
      const g = c.getContext("2d");
      const escala = (480 * fracao) / box.width;
      g.fillStyle = "#777";
      g.fillRect(0, 0, 480, 640);
      const raio = 480 * fracao * 0.9;
      g.beginPath();
      g.ellipse(240, 300, raio, raio * 1.35, 0, 0, 2 * Math.PI);
      g.clip();
      g.filter = `brightness(${brilho})`;
      g.translate(240, 300);
      g.rotate((giro * Math.PI) / 180);
      g.scale(escala, escala);
      g.drawImage(img, -(box.x + box.width / 2), -(box.y + box.height / 2));
      return c.toDataURL("image/jpeg", 0.9);
    };
    const ler = async (src) => {
      const i = await carregar(src);
      let melhor = null;
      for (const inputSize of [224, 320, 416, 608]) {
        const d = await fa
          .detectSingleFace(i, new fa.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (d && (!melhor || d.detection.score > melhor.score)) {
          melhor = { v: Array.from(d.descriptor), score: d.detection.score };
        }
      }
      return melhor;
    };
    const rostos = [];
    for (let s = 0; s < amostras.length; s++) {
      const img = await carregar(amostras[s]);
      const achados = await fa
        .detectAllFaces(img, new fa.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.5 }))
        .withFaceLandmarks();
      for (const d of achados) {
        const b = d.detection.box;
        if (d.detection.score < 0.8 || b.width < 110) continue;
        const recorte = recortar(img, b);
        const leitura = await ler(recorte);
        if (leitura) {
          rostos.push({
            amostra: s + 1,
            recorte,
            leitura,
            escuro: recortar(img, b, { brilho: 0.6 }),
            outraCaptura: recortar(img, b, { brilho: 0.7, giro: -6, fracao: 0.36 }),
          });
        }
      }
    }
    for (const ro of rostos) ro.leituraOutra = await ler(ro.outraCaptura);
    return rostos;
  }, amostras);
  await browser.close();

  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  if (r.length < 4) falhar(`só ${r.length} rostos frontais nas amostras`);
  const diferentes = [];
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) diferentes.push(dist(r[i].leitura.v, r[j].leitura.v));
  const mesma = r.filter((x) => x.leituraOutra).map((x) => dist(x.leitura.v, x.leituraOutra.v));
  const fmt = (xs) => {
    const o = [...xs].sort((a, b) => a - b);
    return `${o[0].toFixed(2)} a ${o[o.length - 1].toFixed(2)}`;
  };
  console.log(`   pessoas diferentes: ${fmt(diferentes)} (${diferentes.length} pares)`);
  console.log(`   mesma pessoa, outra luz/ângulo/distância: ${fmt(mesma)} (${mesma.length} rostos)`);
  const confundidas = diferentes.filter((d) => d < 0.5).length;
  if (confundidas) falhar(`${confundidas} pares de pessoas diferentes abaixo de 0.50`);
  if (Math.max(...mesma) >= 0.5) falhar("a mesma pessoa passou de 0.50 com outra captura");

  const A = r[0];
  const B = r.find((x) => dist(x.leitura.v, A.leitura.v) >= 0.5);
  fs.writeFileSync(
    path.join(TMP, "rostos.json"),
    JSON.stringify({ A: A.recorte, Aescuro: A.escuro, Aoutra: A.outraCaptura, B: B.recorte })
  );
}

const rostosSalvos = () => JSON.parse(fs.readFileSync(path.join(TMP, "rostos.json"), "utf8"));

async function cadastrar(browser, foto, cpf, { foraDaPlanilha } = {}) {
  const { ctx, page } = await comCamera(browser, foto);
  await page.goto(`${BASE}/cadastro-facial/${alvo}`);
  const comecar = page.getByRole("button", { name: "Começar meu cadastro" });
  await esperar(page, comecar, "tela explicativa", 30000);
  await page.fecharCookies();
  await comecar.click();
  await page.fill("input", cpf);
  await page.getByRole("button", { name: "Continuar" }).click();
  if (foraDaPlanilha) {
    await esperar(page, page.getByText("não está na planilha"), "aviso fora da planilha", 30000);
    await page.getByPlaceholder("Como está no seu documento").fill(foraDaPlanilha.nome);
    await page.getByPlaceholder("305").fill(foraDaPlanilha.apto);
    await page.getByRole("button", { name: "Continuar para a foto" }).click();
  } else {
    await page.getByRole("button", { name: "Sim, sou eu" }).click();
  }
  await page.getByRole("checkbox").check();
  const t0 = Date.now();
  await esperar(page, page.getByText("Rosto cadastrado"), `cadastro ${cpf}`);
  await ctx.close();
  return ((Date.now() - t0) / 1000).toFixed(0);
}

async function faseCadastro() {
  const rostos = rostosSalvos();
  const browser = await lancar();
  console.log(`   Ana cadastrou o rosto pela câmera (${await cadastrar(browser, rostos.A, "111.444.777-35")}s)`);
  // Carla cadastra o rosto da Ana (outra luz) no próprio CPF: tem de marcar duplicidade.
  await cadastrar(browser, rostos.Aescuro, "123.456.789-09");
  console.log("   Carla cadastrou usando o rosto da Ana");
  await cadastrar(browser, rostos.B, "390.533.447-05", { foraDaPlanilha: { nome: "Paula Procuradora", apto: "102" } });
  console.log("   Paula (fora da planilha) cadastrou como procuradora");
  await browser.close();
}

async function fasePorta() {
  const rostos = rostosSalvos();
  const browser = await lancar();
  const entrar = async (foto, cpf) => {
    const { ctx, page } = await comCamera(browser, foto);
    await page.goto(`${BASE}/votacao/${alvo}`);
    await esperar(page, page.getByPlaceholder("000.000.000-00"), "entrada da votação", 30000);
    await page.fecharCookies();
    await page.fill("input", cpf);
    await page.getByRole("button", { name: "Continuar" }).click();
    const sim = page.getByRole("button", { name: "Sim, sou eu" });
    const bloqueado = page.getByRole("button", { name: "Digitar outro CPF" });
    await esperar(page, sim.or(bloqueado), `CPF ${cpf}`, 30000);
    if (await bloqueado.isVisible()) {
      await ctx.close();
      return "bloqueado";
    }
    await sim.click();
    const verde = page.getByText("Identidade confirmada");
    const laranja = page.getByText("Entrada registrada");
    await esperar(page, verde.or(laranja), `entrada ${cpf}`);
    const r = (await verde.isVisible()) ? "verde" : "laranja";
    await ctx.close();
    return r;
  };
  const casos = [
    ["Ana com outra captura (mais escura, inclinada, mais longe)", rostos.Aoutra, "111.444.777-35", "verde"],
    ["outra pessoa usando o CPF da Ana", rostos.B, "111.444.777-35", "laranja"],
    ["Bruna, sem cadastro antecipado, depois do prazo", rostos.B, "529.982.247-25", "bloqueado"],
  ];
  for (const [nome, foto, cpf, esperado] of casos) {
    const obtido = await entrar(foto, cpf);
    console.log(`   ${nome}: ${obtido}`);
    if (obtido !== esperado) falhar(`${nome}: esperado ${esperado}, veio ${obtido}`);
  }
  await browser.close();
}

// Lista de presença por biometria, com o rosto de verdade: no condomínio com
// planilha o CPF diz quem é e o rosto confirma; no condomínio sem planilha é o
// rosto que reconhece a pessoa.
async function faseLista() {
  const rostos = rostosSalvos();
  const browser = await lancar();

  const abrirLista = async (foto, lista) => {
    const { ctx, page } = await comCamera(browser, foto);
    await page.goto(`${BASE}/presenca-manual/${lista}`);
    await page.fecharCookies();
    return { ctx, page };
  };
  const fotografar = async (page) => {
    await page.getByRole("button", { name: "Abrir câmera" }).click();
    await page.getByRole("button", { name: /Capturar agora/ }).click({ timeout: 30000 });
    await esperar(page, page.getByText("Rosto lido", { exact: true }), "leitura do rosto na lista");
  };
  const concluir = async (page, observacao) => {
    await page.getByPlaceholder(/sou procurador/).fill(observacao);
    await assinar(page);
    await page.locator('input[type="checkbox"]').first().check();
    await page.getByRole("button", { name: "Confirmar presença" }).click();
  };

  // 1. Com planilha: CPF + rosto da Ana (outra captura, mais escura e de lado).
  let { ctx, page } = await abrirLista(rostos.Aoutra, alvo);
  await esperar(page, page.getByPlaceholder("000.000.000-00"), "portão de CPF da lista", 30000);
  await page.getByPlaceholder("000.000.000-00").fill("111.444.777-35");
  await page.getByRole("button", { name: "Continuar" }).click();
  await esperar(page, page.getByRole("button", { name: "Sim, sou eu" }), "CPF achou a unidade", 30000);
  await page.getByRole("button", { name: "Sim, sou eu" }).click();
  await fotografar(page);
  await concluir(page, "Cheguei cedo.");
  await esperar(page, page.getByText("Presença registrada!"), "presença da Ana pelo rosto");
  console.log("   Ana entrou na lista pelo CPF com o rosto confirmado");
  await ctx.close();

  // 2. Outra pessoa com o CPF da Ana: a lista não aceita uma segunda presença.
  ({ ctx, page } = await abrirLista(rostos.B, alvo));
  await page.getByPlaceholder("000.000.000-00").fill("111.444.777-35");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Sim, sou eu" }).click();
  await fotografar(page);
  await concluir(page, "Sou eu mesma.");
  await esperar(page, page.getByText("Você já está presente"), "segunda pessoa com o CPF da Ana");
  console.log("   outra pessoa com o CPF da Ana: não entrou na lista");
  await ctx.close();

  // 3. Sem planilha: o rosto é quem reconhece; o CPF é só registro.
  ({ ctx, page } = await abrirLista(rostos.A, alvo2));
  await esperar(page, page.getByPlaceholder("000.000.000-00"), "formulário da lista sem planilha", 30000);
  await fotografar(page);
  const campos = page.locator(".card input:not([type=checkbox])");
  await campos.nth(0).fill("Ana Real");
  await page.getByPlaceholder("000.000.000-00").fill("111.444.777-35");
  await campos.nth(3).fill("101");
  await concluir(page, "Primeira vez nesta lista.");
  await esperar(page, page.getByText("Presença registrada!"), "presença sem planilha");
  console.log("   sem planilha: rosto novo entrou e ficou guardado");
  await ctx.close();

  // 4. O mesmo rosto de novo, com outro nome: reconhecido, sem duplicar.
  ({ ctx, page } = await abrirLista(rostos.Aoutra, alvo2));
  await esperar(page, page.getByPlaceholder("000.000.000-00"), "formulário da lista sem planilha", 30000);
  await fotografar(page);
  const campos2 = page.locator(".card input:not([type=checkbox])");
  await campos2.nth(0).fill("Outra Pessoa");
  await page.getByPlaceholder("000.000.000-00").fill("529.982.247-25");
  await campos2.nth(3).fill("102");
  await concluir(page, "Tentando de novo.");
  await esperar(page, page.getByText("Você já está presente"), "mesmo rosto reconhecido");
  await esperar(page, page.getByText("Ana Real"), "aviso de que a presença é de outra pessoa", 10000);
  console.log("   mesmo rosto com outro nome: reconhecido como a Ana, sem segunda presença");
  await ctx.close();

  await browser.close();
}

const fases = { rostos: faseRostos, cadastro: faseCadastro, porta: fasePorta, lista: faseLista };
if (!fases[fase]) falhar(`fase desconhecida: ${fase}`);
fases[fase]().catch((e) => falhar(e.message.split("\n")[0]));

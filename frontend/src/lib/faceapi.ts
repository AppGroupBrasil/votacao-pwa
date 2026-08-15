/**
 * FaceAPI.js wrapper — carrega modelos, detecta rosto e extrai descritores.
 * Processamento 100% client-side. O servidor nunca recebe a imagem/vetor.
 */
import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models";

export type FaceInput = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Carrega os modelos necessários (tiny detector + landmarks + recognition).
 * Chama apenas uma vez; reutiliza em chamadas subsequentes.
 */
export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        // Modelo COMPLETO de 68 pontos (348 KB) em vez da versão reduzida.
        // O reconhecedor foi treinado esperando o rosto alinhado por ele; com a
        // versão "tiny" o alinhamento sai torto e pessoas diferentes acabam com
        // vetores parecidos — foi uma das causas da troca de nomes na
        // assembleia de 08/08/2026. O download extra acontece uma única vez.
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
    } catch (e) {
      // Sem isto, uma única falha (rede caiu, aba trocada no meio do download)
      // ficaria guardada e TODA tentativa seguinte falharia na mesma aba, até
      // recarregar a página. Limpando, a próxima chamada baixa de novo.
      loadingPromise = null;
      throw e;
    }
  })();

  return loadingPromise;
}

export function isModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Ajustes tentados em ordem até achar o rosto. O primeiro resolve o caso comum;
 * os seguintes baixam o corte de confiança e mudam a escala da análise, que é o
 * que salva webcam escura, rosto longe demais ou colado na câmera.
 */
const AJUSTES = [
  { inputSize: 416, scoreThreshold: 0.5 },
  { inputSize: 416, scoreThreshold: 0.25 },
  { inputSize: 320, scoreThreshold: 0.2 },
  { inputSize: 608, scoreThreshold: 0.2 },
];

/**
 * Detecta um único rosto no elemento de vídeo/imagem e retorna o descritor 128-pontos.
 * Retorna null se nenhum rosto for detectado.
 */
export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  opcoes: { inputSize: number; scoreThreshold: number } = AJUSTES[0]
): Promise<Float32Array | null> {
  const r = await detectFaceComQualidade(input, opcoes);
  return r ? r.descriptor : null;
}

/** Uma leitura do rosto com os dados que dizem se ela presta. */
export type Leitura = {
  descriptor: Float32Array;
  /** Confiança da detecção (0 a 1). Abaixo de ~0.6 costuma ser rosto de lado. */
  score: number;
  /** Largura do rosto em pixels. Rosto pequeno = vetor pobre. */
  largura: number;
};

/**
 * Detecta o rosto e devolve, junto com o vetor, a qualidade da leitura. Medir a
 * qualidade é o que permite recusar foto ruim ANTES de comparar: rosto pequeno,
 * escuro ou de perfil gera um vetor impreciso, e vetor impreciso foi o que
 * fazia o sistema confundir uma pessoa com outra.
 */
export async function detectFaceComQualidade(
  input: FaceInput,
  opcoes: { inputSize: number; scoreThreshold: number } = AJUSTES[0]
): Promise<Leitura | null> {
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions(opcoes))
    .withFaceLandmarks() // modelo completo de 68 pontos
    .withFaceDescriptor();

  if (!detection) return null;
  return {
    descriptor: detection.descriptor,
    score: detection.detection.score,
    largura: detection.detection.box.width,
  };
}

/** Rosto menor que isto na imagem não tem detalhe suficiente para comparar. */
export const LARGURA_MINIMA_ROSTO = 90;
/** Abaixo desta confiança normalmente é rosto de lado, escuro ou tremido. */
export const SCORE_MINIMO = 0.6;

export function leituraBoa(l: Leitura): boolean {
  return l.score >= SCORE_MINIMO && l.largura >= LARGURA_MINIMA_ROSTO;
}

export type CaixaRosto = {
  x: number;
  y: number;
  largura: number;
  altura: number;
  score: number;
};

/**
 * Só localiza o rosto na imagem (sem landmarks nem descritor) — é a parte
 * barata da detecção, feita para rodar várias vezes por segundo enquanto a
 * pessoa se posiciona. Coordenadas em pixels do vídeo original.
 */
export async function detectarCaixaRosto(
  input: FaceInput
): Promise<CaixaRosto | null> {
  const d = await faceapi.detectSingleFace(
    input,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 })
  );
  if (!d) return null;
  return {
    x: d.box.x,
    y: d.box.y,
    largura: d.box.width,
    altura: d.box.height,
    score: d.score,
  };
}

/** Detecta tentando todos os ajustes; devolve também qual funcionou. */
export async function detectFaceTentandoTudo(
  input: FaceInput
): Promise<{ leitura: Leitura; ajuste: (typeof AJUSTES)[number] } | null> {
  for (const ajuste of AJUSTES) {
    const l = await detectFaceComQualidade(input, ajuste);
    if (l) return { leitura: l, ajuste };
  }
  return null;
}

/**
 * Lê o rosto algumas vezes e devolve as leituras SEPARADAS, da melhor para a
 * pior.
 *
 * Antes daqui saía a média das leituras, para "facilitar o reconhecimento". Só
 * que a média puxa todo rosto na direção de um rosto médio: encurta a distância
 * para a pessoa certa e para todas as outras junto, o que ajudou a produzir os
 * nomes trocados na assembleia de 08/08/2026. Guardando as leituras inteiras, o
 * servidor compara contra a mais parecida e cada rosto continua sendo ele mesmo.
 */
export async function capturarLeituras(
  entrada: FaceInput | FaceInput[],
  amostras = 3
): Promise<Leitura[]> {
  const entradas = Array.isArray(entrada) ? entrada : [entrada];

  // Primeira leitura: descobre em qual entrada (vídeo ao vivo ou foto já
  // capturada) e com qual ajuste o rosto aparece. As demais repetem o que deu
  // certo, em vez de gastar tempo tentando tudo de novo.
  let alvo: FaceInput | null = null;
  let ajuste: (typeof AJUSTES)[number] | null = null;
  const leituras: Leitura[] = [];

  for (const e of entradas) {
    const r = await detectFaceTentandoTudo(e);
    if (r) {
      alvo = e;
      ajuste = r.ajuste;
      leituras.push(r.leitura);
      break;
    }
  }
  if (!alvo || !ajuste) return [];

  // Imagem parada não muda entre leituras — repetir daria o mesmo vetor.
  const aoVivo =
    typeof HTMLVideoElement !== "undefined" && alvo instanceof HTMLVideoElement;
  if (aoVivo) {
    for (let i = 1; i < amostras; i++) {
      // 120 ms dá tempo de a pessoa mudar minimamente de posição, o que torna
      // as leituras diferentes entre si — é isso que faz o cadastro cobrir mais
      // situações depois.
      await new Promise((r) => setTimeout(r, 120));
      const l = await detectFaceComQualidade(alvo, ajuste);
      if (l) leituras.push(l);
    }
  }

  // Melhor primeiro: mais confiança e rosto maior valem mais.
  leituras.sort((a, b) => b.score * b.largura - a.score * a.largura);
  return leituras;
}

/**
 * A melhor leitura do rosto — é ela que vai para a confirmação um-contra-um.
 * Devolve também se a qualidade ficou aceitável, para a tela poder avisar em vez
 * de mandar um vetor ruim para comparação.
 */
export async function lerRosto(
  entrada: FaceInput | FaceInput[]
): Promise<{ leituras: Leitura[]; boa: boolean } | null> {
  const leituras = await capturarLeituras(entrada);
  if (!leituras.length) return null;
  return { leituras, boa: leituraBoa(leituras[0]) };
}

/**
 * Calcula a distância euclidiana entre dois descritores faciais.
 * Menor = mais similar. Limiar típico: 0.6
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  return faceapi.euclideanDistance(Array.from(a), Array.from(b));
}

export const FACE_MATCH_THRESHOLD = 0.65;

/**
 * Verifica se dois descritores pertencem à mesma pessoa.
 */
export function isSamePerson(
  a: Float32Array,
  b: Float32Array,
  threshold = FACE_MATCH_THRESHOLD
): boolean {
  return euclideanDistance(a, b) < threshold;
}

/**
 * Gera o hash SHA-256 do descritor facial.
 * Formato IDÊNTICO ao backend (biometria.py):
 *   ",".join(f"{v:.6f}" for v in vetor)  →  SHA-256 hex
 */
export async function hashDescriptor(descriptor: Float32Array): Promise<string> {
  const payload = Array.from(descriptor)
    .map((v) => v.toFixed(6))
    .join(",");

  const encoded = new TextEncoder().encode(payload);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Serializa o descritor para armazenamento em IndexedDB.
 */
export function serializeDescriptor(descriptor: Float32Array): number[] {
  return Array.from(descriptor);
}

/**
 * Deserializa um descritor lido do IndexedDB.
 */
export function deserializeDescriptor(data: number[]): Float32Array {
  return new Float32Array(data);
}

// ----- IndexedDB: armazenamento local do descritor -----

const DB_NAME = "votacao_biometria";
const DB_VERSION = 1;
const STORE_NAME = "descriptors";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Salva o descritor facial localmente (IndexedDB) — nunca sai do dispositivo.
 * Usado para comparação client-side na verificação durante a votação.
 */
export async function saveDescriptorLocal(
  eleitorId: string,
  descriptor: Float32Array
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(serializeDescriptor(descriptor), eleitorId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Recupera o descritor facial do IndexedDB.
 */
export async function getDescriptorLocal(
  eleitorId: string
): Promise<Float32Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(eleitorId);
    req.onsuccess = () => {
      if (req.result) {
        resolve(deserializeDescriptor(req.result));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

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
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
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
  const detection = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions(opcoes))
    .withFaceLandmarks(true) // useTinyModel = true
    .withFaceDescriptor();

  if (!detection) return null;
  return detection.descriptor;
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
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<{ descriptor: Float32Array; ajuste: (typeof AJUSTES)[number] } | null> {
  for (const ajuste of AJUSTES) {
    const d = await detectFace(input, ajuste);
    if (d) return { descriptor: d, ajuste };
  }
  return null;
}

/**
 * Lê o rosto várias vezes e devolve a MÉDIA dos descritores. Cada leitura tem um
 * ruído pequeno (luz/tremor/ângulo); tirar a média aproxima o vetor do "rosto
 * real" da pessoa e reduz a distância na comparação — reconhece com mais
 * facilidade a mesma pessoa. Retorna null se não achar rosto em nenhuma amostra.
 */
export async function detectFaceAveraged(
  entrada: FaceInput | FaceInput[],
  amostras = 4
): Promise<Float32Array | null> {
  const entradas = Array.isArray(entrada) ? entrada : [entrada];

  // Primeira leitura: descobre em qual entrada (vídeo ao vivo ou foto já
  // capturada) e com qual ajuste o rosto aparece. As demais repetem o que deu
  // certo, em vez de gastar tempo tentando tudo de novo.
  let alvo: FaceInput | null = null;
  let ajuste: (typeof AJUSTES)[number] | null = null;
  const descritores: Float32Array[] = [];

  for (const e of entradas) {
    const r = await detectFaceTentandoTudo(e);
    if (r) {
      alvo = e;
      ajuste = r.ajuste;
      descritores.push(r.descriptor);
      break;
    }
  }
  if (!alvo || !ajuste) return null;

  // Imagem parada não muda entre leituras — repetir daria o mesmo vetor.
  const aoVivo = typeof HTMLVideoElement !== "undefined" && alvo instanceof HTMLVideoElement;
  if (aoVivo) {
    for (let i = 1; i < amostras; i++) {
      await new Promise((r) => setTimeout(r, 160));
      const d = await detectFace(alvo, ajuste);
      if (d) descritores.push(d);
    }
  }
  if (!descritores.length) return null;
  const media = new Float32Array(descritores[0].length);
  for (const d of descritores) {
    for (let j = 0; j < media.length; j++) media[j] += d[j];
  }
  for (let j = 0; j < media.length; j++) media[j] /= descritores.length;
  return media;
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

"use client";

/**
 * Página de apoio para descobrir POR QUE o rosto não é lido em um aparelho.
 * Mostra cada etapa em português (baixar modelos, abrir câmera, procurar rosto)
 * e o erro exato quando alguma falha — a tela de presença só diz "não consegui".
 */
import { useEffect, useRef, useState } from "react";

type Linha = { texto: string; estado: "ok" | "erro" | "andando" };

export default function DiagnosticoFacial() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function add(texto: string, estado: Linha["estado"] = "ok") {
    setLinhas((l) => [...l, { texto, estado }]);
  }

  async function rodar() {
    setLinhas([]);
    setRodando(true);
    try {
      add(`Navegador: ${navigator.userAgent.slice(0, 90)}`);
      add(`Endereço: ${window.location.origin} — câmera exige localhost ou https`);

      // 1) Biblioteca
      let faceapi: typeof import("@vladmandic/face-api");
      try {
        faceapi = await import("@vladmandic/face-api");
        add("Biblioteca de reconhecimento carregada.");
      } catch (e) {
        add(`FALHOU ao carregar a biblioteca: ${msg(e)}`, "erro");
        return;
      }

      // 2) Arquivos dos modelos (o que a rede realmente devolve)
      for (const arq of [
        "tiny_face_detector_model-weights_manifest.json",
        "face_landmark_68_tiny_model-weights_manifest.json",
        "face_recognition_model-weights_manifest.json",
      ]) {
        try {
          const r = await fetch(`/models/${arq}`, { cache: "no-store" });
          add(`/models/${arq} → ${r.status} ${r.ok ? "" : "(PROBLEMA)"}`, r.ok ? "ok" : "erro");
        } catch (e) {
          add(`/models/${arq} → falhou: ${msg(e)}`, "erro");
        }
      }

      // 3) Carregar os três modelos
      try {
        const t = performance.now();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        add(`Modelos prontos em ${Math.round(performance.now() - t)} ms.`);
      } catch (e) {
        add(`FALHOU ao preparar os modelos: ${msg(e)}`, "erro");
        return;
      }

      // 4) Câmera
      const video = videoRef.current;
      if (!video) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        await new Promise((r) => setTimeout(r, 900)); // deixa a imagem estabilizar
        add(`Câmera aberta: ${video.videoWidth}x${video.videoHeight}.`,
          video.videoWidth ? "ok" : "erro");
      } catch (e) {
        add(`FALHOU ao abrir a câmera: ${msg(e)}`, "erro");
        return;
      }

      // 5) Procurar o rosto com vários ajustes, no vídeo e na foto parada
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

      let achou = false;
      for (const [nome, alvo] of [["vídeo ao vivo", video], ["foto parada", canvas]] as const) {
        for (const inputSize of [416, 320, 608]) {
          for (const scoreThreshold of [0.5, 0.25, 0.1]) {
            const det = await faceapi.detectSingleFace(
              alvo as HTMLVideoElement | HTMLCanvasElement,
              new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
            );
            const rotulo = `${nome} — tamanho ${inputSize}, confiança ${scoreThreshold}`;
            if (det) {
              achou = true;
              add(`${rotulo}: ROSTO ENCONTRADO (certeza ${(det.score * 100).toFixed(0)}%, ` +
                `área ${Math.round(det.box.width)}x${Math.round(det.box.height)} px)`);
            } else {
              add(`${rotulo}: nenhum rosto.`, "erro");
            }
          }
        }
      }

      if (!achou) {
        add("Nenhum ajuste encontrou rosto: é imagem (luz de fundo, contraluz, rosto muito longe ou muito perto), não é o programa.", "erro");
      } else {
        // 6) Descritor completo — é o que a presença precisa
        try {
          const d = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 }))
            .withFaceLandmarks(true)
            .withFaceDescriptor();
          add(d
            ? `Leitura completa OK: vetor de ${d.descriptor.length} pontos gerado.`
            : "Achou o rosto, mas a leitura completa (pontos do rosto) não saiu.",
            d ? "ok" : "erro");
        } catch (e) {
          add(`FALHOU na leitura completa: ${msg(e)}`, "erro");
        }
      }
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRodando(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Teste da câmera e do reconhecimento</h1>
        <p className="text-sm text-slate-600">
          Clique no botão, permita a câmera e fique de frente para ela em um lugar claro.
          A lista abaixo mostra onde está o problema.
        </p>

        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full max-w-sm rounded-xl bg-black aspect-[3/4] object-cover"
        />

        <button
          onClick={rodar}
          disabled={rodando}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {rodando ? "Testando..." : "Testar agora"}
        </button>

        <ol className="space-y-1 text-sm">
          {linhas.map((l, i) => (
            <li
              key={i}
              className={
                l.estado === "erro"
                  ? "text-red-700 bg-red-50 rounded px-2 py-1 break-words"
                  : "text-slate-700 bg-white rounded px-2 py-1 break-words"
              }
            >
              {l.texto}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function msg(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Loader2, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";
import {
  loadModels,
  lerRosto,
  detectarCaixaRosto,
  LARGURA_MINIMA_ROSTO,
  hashDescriptor,
  saveDescriptorLocal,
} from "@/lib/faceapi";

type Status =
  | "loading-models"
  | "camera-starting"
  | "ready"
  | "capturing"
  | "success"
  | "error"
  | "no-face"
  | "foto-ruim"
  | "no-camera";

interface FaceCaptureProps {
  eleitorId: string;
  onCapture: (hash: string) => void;
}

export default function FaceCapture({ eleitorId, onCapture }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("loading-models");
  const [error, setError] = useState("");
  const autoCapturing = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Cleanup camera stream ao desmontar
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Inicializar: carregar modelos → abrir câmera
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus("loading-models");
        await loadModels();
        if (cancelled) return;

        setStatus("camera-starting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("ready");
      } catch (err: any) {
        if (cancelled) return;
        console.error("[FaceCapture] Init error:", err);

        if (err?.name === "NotAllowedError" || err?.name === "NotFoundError") {
          setStatus("no-camera");
          setError("Permissão de câmera negada ou câmera não encontrada.");
        } else {
          setStatus("error");
          setError(err?.message || "Erro ao inicializar");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCapture() {
    if (!videoRef.current) return;
    setError("");

    try {
      setStatus("capturing");

      const leitura = await lerRosto(videoRef.current);

      if (!leitura) {
        setStatus("no-face");
        return;
      }

      // Cadastro é a base de tudo: vetor tirado de foto escura ou de rosto
      // pequeno na tela faz a verificação falhar depois (ou casar com quem não
      // deve). Melhor recusar aqui e pedir outra foto.
      if (!leitura.boa) {
        setStatus("foto-ruim");
        return;
      }

      const descriptor = leitura.leituras[0].descriptor;

      // 1. Gerar hash SHA-256 (idêntico ao backend)
      const hash = await hashDescriptor(descriptor);

      // 2. Salvar descritor localmente (IndexedDB) para verificação futura
      await saveDescriptorLocal(eleitorId, descriptor);

      // 3. Parar câmera
      stopCamera();

      setStatus("success");

      // 4. Devolver hash ao componente pai
      onCapture(hash);
    } catch (err: any) {
      console.error("[FaceCapture] Capture error:", err);
      setError(err?.message || "Erro na captura facial");
      setStatus("error");
    }
  }

  const handleCaptureRef = useRef(handleCapture);
  handleCaptureRef.current = handleCapture;

  // Auto-detect: tenta detectar rosto automaticamente a cada 800ms
  useEffect(() => {
    if (status !== "ready") {
      autoCapturing.current = false;
      return;
    }

    autoCapturing.current = true;

    const interval = setInterval(async () => {
      if (!autoCapturing.current || !videoRef.current) return;

      try {
        // Só localizar o rosto (sem landmarks nem vetor) — é a parte barata da
        // detecção e é tudo que este laço precisa saber. Antes daqui saía um
        // descritor completo a cada 800 ms, que travava celular fraco.
        const caixa = await detectarCaixaRosto(videoRef.current);
        if (!caixa || caixa.largura < LARGURA_MINIMA_ROSTO) return;
        if (!autoCapturing.current) return;

        // Rosto detectado — iniciar contagem regressiva
        autoCapturing.current = false;
        clearInterval(interval);

        setCountdown(3);
        setTimeout(() => setCountdown(2), 1000);
        setTimeout(() => setCountdown(1), 2000);
        setTimeout(() => {
          setCountdown(null);
          handleCaptureRef.current();
        }, 3000);
      } catch {
        // Silenciar erros de detecção no loop
      }
    }, 800);

    return () => {
      autoCapturing.current = false;
      clearInterval(interval);
    };
  }, [status]);

  if (status === "no-camera") {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h3 className="font-semibold">Câmera Indisponível</h3>
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="font-semibold text-lg">Rosto Capturado!</h3>
        <p className="text-sm text-gray-500">
          A imagem foi processada localmente e descartada.
          Apenas o hash biométrico foi gerado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Viewfinder */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[3/4] mx-auto max-w-xs">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover mirror"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Oval guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-48 h-60 border-2 rounded-[50%] transition-colors duration-500 ${
            status === "ready" ? "border-green-400 animate-pulse" : "border-white/50"
          }`} />
        </div>

        {/* Status overlay */}
        {(status === "loading-models" || status === "camera-starting") && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">
              {status === "loading-models"
                ? "Carregando modelos de IA..."
                : "Iniciando câmera..."}
            </p>
          </div>
        )}

        {status === "capturing" && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Analisando rosto...</p>
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-7xl font-bold animate-ping">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {/* Instruções */}
      <p className="text-center text-sm text-gray-500">
        {countdown !== null
          ? "Fique parado, capturando..."
          : status === "ready"
            ? "Posicione seu rosto dentro da moldura oval. A captura será automática."
            : "Posicione seu rosto dentro da moldura oval."}
      </p>

      {/* Error / no-face */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 text-center">
          {error}
        </div>
      )}

      {status === "no-face" && (
        <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 text-center">
          Nenhum rosto detectado. Garanta boa iluminação e tente novamente.
        </div>
      )}

      {status === "foto-ruim" && (
        <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 text-center">
          A imagem ficou escura ou o rosto ficou pequeno na tela. Chegue mais
          perto, olhe para a câmera e tente de novo.
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-3">
        {(status === "no-face" || status === "foto-ruim") && (
          <button
            onClick={() => setStatus("ready")}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Tentar de Novo
          </button>
        )}

        <button
          onClick={handleCapture}
          disabled={
            status !== "ready" && status !== "no-face" && status !== "foto-ruim"
          }
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          Capturar
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Loader2, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";

type Status =
  | "camera-starting"
  | "ready"
  | "captured"
  | "sending"
  | "success"
  | "error"
  | "no-camera";

interface SelfieVerifyProps {
  eleitorId: string;
  assembleiaId: string;
  onSuccess: (token: string, votos?: number) => void;
  onFallback?: () => void;
}

// Degrau "selfie" da escada de identidade: não faz conferência facial — apenas
// registra a foto e o voto conta na hora. A administração revê depois.
export default function SelfieVerify({
  eleitorId,
  assembleiaId,
  onSuccess,
  onFallback,
}: SelfieVerifyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("camera-starting");
  const [foto, setFoto] = useState("");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setStatus("camera-starting");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStatus("ready");
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "NotFoundError") {
        setStatus("no-camera");
        setError("Permissão de câmera negada ou câmera não encontrada.");
      } else {
        setStatus("error");
        setError(err?.message || "Erro ao iniciar a câmera");
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  function capturar() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const max = 640;
    const escala = Math.min(1, max / Math.max(video.videoWidth || max, video.videoHeight || max));
    canvas.width = Math.round((video.videoWidth || max) * escala);
    canvas.height = Math.round((video.videoHeight || max) * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFoto(canvas.toDataURL("image/jpeg", 0.7));
    stopCamera();
    setStatus("captured");
  }

  async function confirmar() {
    if (!foto) return;
    setError("");
    setStatus("sending");
    try {
      const result = await api.selfieAuthVerify(eleitorId, assembleiaId, foto);
      setStatus("success");
      setTimeout(() => onSuccess(result.token, result.votos_permitidos), 800);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Erro ao enviar a selfie");
      setStatus("error");
    }
  }

  if (status === "no-camera") {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h3 className="font-semibold">Câmera Indisponível</h3>
        <p className="text-sm text-gray-500">{error}</p>
        {onFallback && (
          <button onClick={onFallback} className="btn-secondary w-full">
            Usar outro método
          </button>
        )}
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="font-semibold text-lg">Selfie registrada</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-semibold">Selfie de identificação</h3>
        <p className="text-sm text-gray-500">
          Tire uma foto do seu rosto para registrar o voto.
        </p>
      </div>

      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-[3/4] mx-auto max-w-xs">
        {status === "captured" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="Selfie" className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-60 border-2 border-white/50 rounded-[50%]" />
        </div>

        {(status === "camera-starting" || status === "sending") && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">
              {status === "sending" ? "Registrando..." : "Iniciando câmera..."}
            </p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 text-center">
          {error}
        </div>
      )}

      {status === "captured" ? (
        <div className="flex gap-3">
          <button
            onClick={() => { setFoto(""); startCamera(); }}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Refazer
          </button>
          <button onClick={confirmar} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Confirmar
          </button>
        </div>
      ) : (
        <button
          onClick={capturar}
          disabled={status !== "ready"}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          Tirar selfie
        </button>
      )}

      {onFallback && status !== "sending" && (
        <button
          onClick={onFallback}
          className="text-sm text-gray-400 hover:text-gray-600 w-full text-center"
        >
          Usar outro método de autenticação
        </button>
      )}
    </div>
  );
}

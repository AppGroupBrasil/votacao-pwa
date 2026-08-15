"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScanFace, Loader2, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";
import {
  loadModels,
  lerRosto,
  getDescriptorLocal,
  isSamePerson,
  hashDescriptor,
} from "@/lib/faceapi";
import { api } from "@/lib/api";

type Status =
  | "loading"
  | "camera-starting"
  | "ready"
  | "verifying"
  | "success"
  | "no-match"
  | "no-face"
  | "foto-ruim"
  | "no-descriptor"
  | "error"
  | "no-camera";

interface FaceVerifyProps {
  eleitorId: string;
  assembleiaId: string;
  onSuccess: (token: string, votos?: number) => void;
  onFallback?: () => void;
}

export default function FaceVerify({
  eleitorId,
  assembleiaId,
  onSuccess,
  onFallback,
}: FaceVerifyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const storedDescriptor = useRef<Float32Array | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Inicializar: carregar modelos + descritor salvo + câmera
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus("loading");

        // Carregar modelos e descritor em paralelo
        const [, descriptor] = await Promise.all([
          loadModels(),
          getDescriptorLocal(eleitorId),
        ]);

        if (cancelled) return;

        if (!descriptor) {
          setStatus("no-descriptor");
          return;
        }

        storedDescriptor.current = descriptor;

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
        console.error("[FaceVerify] Init error:", err);

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
  }, [eleitorId]);

  async function handleVerify() {
    if (!videoRef.current || !storedDescriptor.current) return;
    setError("");

    try {
      setStatus("verifying");

      const leitura = await lerRosto(videoRef.current);

      if (!leitura) {
        setStatus("no-face");
        return;
      }

      // Leitura ruim não vai para comparação: rosto escuro ou pequeno gera um
      // vetor impreciso, que tanto reprova a pessoa certa quanto aprova a
      // errada. Melhor pedir outra foto.
      if (!leitura.boa) {
        setStatus("foto-ruim");
        return;
      }

      // Comparação client-side por distância euclidiana. Basta uma das leituras
      // bater — são a mesma pessoa em poses ligeiramente diferentes, e exigir
      // que a primeira acerte reprovava morador de verdade sem motivo.
      const match = leitura.leituras.some((l) =>
        isSamePerson(l.descriptor, storedDescriptor.current!)
      );

      if (!match) {
        setStatus("no-match");
        return;
      }

      // Match! Enviar ao servidor a assinatura do descritor de cadastro
      // persistido localmente, que corresponde ao hash salvo no backend.
      const hash = await hashDescriptor(storedDescriptor.current);

      const result = await api.facialAuthVerify(eleitorId, assembleiaId, hash);

      stopCamera();
      setStatus("success");
      setTimeout(() => onSuccess(result.token, result.votos_permitidos), 1000);
    } catch (err: any) {
      console.error("[FaceVerify] Verify error:", err);
      const msg =
        err?.response?.data?.error || err?.message || "Erro na verificação facial";
      setError(msg);
      setStatus("error");
    }
  }

  // Sem descritor armazenado — não fez cadastro neste dispositivo
  if (status === "no-descriptor") {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h3 className="font-semibold">Biometria Não Encontrada</h3>
        <p className="text-sm text-gray-500">
          Nenhum cadastro facial encontrado neste dispositivo.
          Utilize o mesmo aparelho usado no cadastro.
        </p>
        {onFallback && (
          <button onClick={onFallback} className="btn-secondary w-full">
            Usar outro método
          </button>
        )}
      </div>
    );
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
        <h3 className="font-semibold text-lg">Identidade Confirmada</h3>
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
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Oval guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-60 border-2 border-white/50 rounded-[50%]" />
        </div>

        {(status === "loading" || status === "camera-starting") && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">
              {status === "loading" ? "Carregando modelos..." : "Iniciando câmera..."}
            </p>
          </div>
        )}

        {status === "verifying" && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Verificando identidade...</p>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-gray-500">
        Posicione seu rosto dentro da moldura para verificar sua identidade.
      </p>

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

      {status === "no-match" && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 text-center">
          Rosto não corresponde ao cadastrado. Tente novamente.
        </div>
      )}

      <div className="flex gap-3">
        {(status === "no-face" ||
          status === "foto-ruim" ||
          status === "no-match" ||
          status === "error") && (
          <button
            onClick={() => {
              setError("");
              setStatus("ready");
            }}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Tentar de Novo
          </button>
        )}

        <button
          onClick={handleVerify}
          disabled={
            status !== "ready" &&
            status !== "no-face" &&
            status !== "foto-ruim" &&
            status !== "no-match" &&
            status !== "error"
          }
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <ScanFace className="w-4 h-4" />
          Verificar
        </button>
      </div>

      {onFallback && (
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

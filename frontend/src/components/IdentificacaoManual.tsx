"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowLeft, Camera, CheckCircle, Loader2, RefreshCw, UserRound } from "lucide-react";
import { api, getDeviceId } from "@/lib/api";

interface IdentificacaoManualProps {
  assembleiaId: string;
  onSuccess: (token: string, votanteManualId: string, avisoUnidade?: string) => void;
  onBack: () => void;
}

export default function IdentificacaoManual({
  assembleiaId,
  onSuccess,
  onBack,
}: IdentificacaoManualProps) {
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [selfie, setSelfie] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamAtiva(false);
  }, []);

  useEffect(() => () => pararCamera(), [pararCamera]);

  // O <video> só é montado depois que camAtiva vira true, então a conexão do
  // stream precisa acontecer aqui (no re-render), não dentro de abrirCamera.
  useEffect(() => {
    if (camAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camAtiva]);

  async function abrirCamera() {
    setCamErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamAtiva(true);
    } catch {
      setCamErro("Não foi possível acessar a câmera. Verifique a permissão.");
    }
  }

  function capturarSelfie() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth) {
      setCamErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    setCamErro("");
    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    const max = 640;
    const escala = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg", 0.7));
    pararCamera();
  }

  async function handleEntrar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe o seu nome completo.");
      return;
    }
    if (!apartamento.trim()) {
      setErro("Informe o apartamento/unidade.");
      return;
    }
    if (!selfie) {
      setErro("A selfie é obrigatória na votação manual.");
      return;
    }
    setEnviando(true);
    try {
      const result = await api.acessoManualVotacao(assembleiaId, {
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        selfie,
        device_id: getDeviceId(),
      });
      setSucesso(true);
      setTimeout(() => onSuccess(result.token, result.votante_manual_id, result.aviso_unidade || ""), 800);
    } catch (err: any) {
      setErro(
        err?.response?.data?.error || "Não foi possível entrar. Tente novamente."
      );
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="font-semibold text-lg">Identificação registrada</h3>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para o e-mail
      </button>

      <div className="text-center space-y-2">
        <UserRound className="w-12 h-12 text-primary-600 mx-auto" />
        <h3 className="font-semibold text-lg">Votação manual</h3>
        <p className="text-sm text-gray-500">
          Informe seus dados e tire uma selfie para comprovar que é você quem
          está votando. Seu voto vale imediatamente e a selfie fica disponível
          para conferência da administração.
        </p>
      </div>

      {erro && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{erro}</div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Nome completo</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none transition-colors"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Bloco</label>
          <input
            value={bloco}
            onChange={(e) => setBloco(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Apartamento</label>
          <input
            value={apartamento}
            onChange={(e) => setApartamento(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Selfie</label>
        {selfie ? (
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selfie} alt="Selfie" className="mx-auto rounded-lg max-h-60" />
            <button
              onClick={() => {
                setSelfie("");
                abrirCamera();
              }}
              className="mt-3 inline-flex items-center gap-1 text-sm text-primary-600"
            >
              <RefreshCw className="w-4 h-4" /> Tirar outra
            </button>
          </div>
        ) : camAtiva ? (
          <div className="text-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="mx-auto rounded-lg max-h-60 bg-black"
            />
            <button
              onClick={capturarSelfie}
              className="btn-primary mt-3 inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Capturar
            </button>
            {camErro && <p className="mt-2 text-sm text-red-600">{camErro}</p>}
          </div>
        ) : (
          <div className="text-center">
            <button
              onClick={abrirCamera}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" /> Abrir câmera
            </button>
            {camErro && <p className="mt-2 text-sm text-red-600">{camErro}</p>}
          </div>
        )}
      </div>

      <button
        onClick={handleEntrar}
        disabled={enviando}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {enviando ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Entrando...
          </>
        ) : (
          "Entrar e votar"
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Se não concordar em enviar a selfie, entre em contato com a
        administradora ou o suporte do sistema para se cadastrar com seu e-mail.
      </p>
    </div>
  );
}

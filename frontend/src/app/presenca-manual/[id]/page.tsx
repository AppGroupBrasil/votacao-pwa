"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, Camera, RefreshCw, Check, Eraser } from "lucide-react";
import { api } from "@/lib/api";

export default function PresencaManualPublicaPage() {
  const params = useParams();
  const id = params.id as string;

  const [lista, setLista] = useState<{ titulo: string; ativa: boolean } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [selfie, setSelfie] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");

  // --- assinatura (canvas) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temAssinatura, setTemAssinatura] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getListaPresencaPublica(id)
      .then((d) => setLista(d))
      .catch(() => setErro("Lista de presença não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

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

  // --- canvas de assinatura ---
  function posicao(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function iniciarTraco(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    const p = posicao(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function moverTraco(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = posicao(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setTemAssinatura(true);
  }

  function terminarTraco() {
    desenhando.current = false;
  }

  function limparAssinatura() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemAssinatura(false);
  }

  async function enviar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe o seu nome.");
      return;
    }
    if (!apartamento.trim()) {
      setErro("Informe o apartamento.");
      return;
    }
    if (!temAssinatura) {
      setErro("Assine no campo indicado.");
      return;
    }
    const assinatura = canvasRef.current?.toDataURL("image/png") || "";
    setEnviando(true);
    try {
      await api.registrarPresencaManual(id, {
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        selfie,
        assinatura,
      });
      setEnviado(true);
    } catch (e: any) {
      setErro(
        e?.response?.data?.error || "Não foi possível registrar a presença."
      );
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (erro && !lista) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-600">
        {erro}
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full bg-green-100 text-green-600 p-4 mb-4">
          <Check className="w-10 h-10" />
        </div>
        <h1 className="text-xl font-bold mb-1">Presença registrada!</h1>
        <p className="text-gray-500">Obrigado, {nome}.</p>
      </div>
    );
  }

  if (lista && !lista.ativa) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-600">
        Esta lista de presença está encerrada.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">Lista de presença</h1>
        <p className="text-sm text-gray-500 mb-5">{lista?.titulo}</p>

        {/* Selfie */}
        <div className="card mb-4">
          <label className="block text-sm font-medium mb-2">Selfie</label>
          {selfie ? (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfie}
                alt="Selfie"
                className="mx-auto rounded-lg max-h-60"
              />
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
              {camErro && (
                <p className="mt-2 text-sm text-red-600">{camErro}</p>
              )}
            </div>
          ) : (
            <div className="text-center">
              <button
                onClick={abrirCamera}
                className="btn-secondary inline-flex items-center gap-2"
              >
                <Camera className="w-4 h-4" /> Abrir câmera
              </button>
              {camErro && (
                <p className="mt-2 text-sm text-red-600">{camErro}</p>
              )}
            </div>
          )}
        </div>

        {/* Dados */}
        <div className="card mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Bloco</label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Apartamento
              </label>
              <input
                value={apartamento}
                onChange={(e) => setApartamento(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>
        </div>

        {/* Assinatura */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">
              Assinatura
            </label>
            <button
              onClick={limparAssinatura}
              className="inline-flex items-center gap-1 text-sm text-gray-500"
            >
              <Eraser className="w-4 h-4" /> Limpar
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={500}
            height={200}
            onPointerDown={iniciarTraco}
            onPointerMove={moverTraco}
            onPointerUp={terminarTraco}
            onPointerLeave={terminarTraco}
            className="w-full h-44 rounded-lg border border-dashed border-gray-300 bg-white touch-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Assine com o dedo na área acima.
          </p>
        </div>

        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

        <button
          onClick={enviar}
          disabled={enviando}
          className="btn-primary w-full disabled:opacity-50"
        >
          {enviando ? "Enviando..." : "Confirmar presença"}
        </button>
      </div>
    </div>
  );
}

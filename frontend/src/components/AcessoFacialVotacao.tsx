"use client";

import { useEffect, useRef, useState } from "react";
import { ScanFace, Camera, Loader2, Mail, ShieldCheck } from "lucide-react";
import { api, getDeviceId } from "@/lib/api";
import { loadModels, detectFaceAveraged } from "@/lib/faceapi";

const PERFIS = [
  { v: "proprietario", l: "Proprietário" },
  { v: "locatario", l: "Locatário" },
  { v: "conjuge", l: "Cônjuge" },
  { v: "procurador", l: "Procurador" },
  { v: "outro", l: "Outro" },
];

/**
 * Entrada da votação pelo rosto (reconhecimento 1:N no servidor).
 * - Reconheceu o rosto → entra e vota na hora.
 * - Rosto novo → cadastra ali (nome/unidade/selfie/LGPD) e entra.
 * - Não quer/não consegue pelo rosto → cai para o e-mail (onEmail).
 */
export default function AcessoFacialVotacao({
  assembleiaId,
  onSuccess,
  onEmail,
  onManual,
}: {
  assembleiaId: string;
  onSuccess: (token: string, votanteId: string, avisoUnidade?: string) => void;
  onEmail: () => void;
  onManual: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [novoRosto, setNovoRosto] = useState(false);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [selfie, setSelfie] = useState("");
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("proprietario");
  const [lgpd, setLgpd] = useState(false);

  useEffect(() => {
    loadModels().catch(() => {});
    return () => pararCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (camAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camAtiva]);

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamAtiva(false);
  }

  async function abrirCamera() {
    setErro("");
    loadModels().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamAtiva(true);
    } catch {
      setErro(
        "Não foi possível abrir a câmera. Verifique a permissão ou entre pelo e-mail."
      );
    }
  }

  function capturarFrame(video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    const max = 640;
    const escala = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function lerRosto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const canvas = capturarFrame(video);
      if (!canvas) return;
      await loadModels();
      // Média de várias leituras do rosto ao vivo: vetor mais estável, reconhece
      // a mesma pessoa com mais facilidade. O canvas serve só para a selfie.
      const desc = await detectFaceAveraged(video, 4);
      if (!desc) {
        setErro(
          "Não reconheci um rosto. Aproxime-se, melhore a luz e tente de novo."
        );
        return;
      }
      const arr = Array.from(desc);
      const selfieData = canvas.toDataURL("image/jpeg", 0.7);
      setDescriptor(arr);
      setSelfie(selfieData);
      const r = await api.acessoFacialVotacao(assembleiaId, {
        descriptor: arr,
        device_id: getDeviceId(),
      });
      if (r.encontrado && r.token) {
        pararCamera();
        onSuccess(r.token, r.votante_manual_id || "", r.aviso_unidade || "");
        return;
      }
      // Rosto novo: pede nome/unidade uma única vez, depois entra e vota.
      pararCamera();
      setNovoRosto(true);
    } catch {
      setErro("Não foi possível processar o rosto. Tente de novo ou use o e-mail.");
    } finally {
      setProcessando(false);
    }
  }

  async function cadastrarEEntrar() {
    if (!descriptor) return;
    if (!nome.trim() || !apartamento.trim()) {
      setErro("Informe seu nome e apartamento/unidade.");
      return;
    }
    if (!lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const r = await api.acessoFacialVotacao(assembleiaId, {
        descriptor,
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        perfil,
        selfie,
        consentimento_lgpd: true,
        device_id: getDeviceId(),
      });
      if (r.encontrado && r.token) {
        onSuccess(r.token, r.votante_manual_id || "", r.aviso_unidade || "");
        return;
      }
      setErro("Não foi possível concluir. Tente novamente.");
    } catch (e: any) {
      setErro(
        e?.response?.data?.error || "Não foi possível concluir. Tente novamente."
      );
    } finally {
      setProcessando(false);
    }
  }

  // Passo 2: rosto novo — cadastro rápido para poder votar.
  if (novoRosto) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ScanFace className="w-6 h-6 text-primary-600" />
          <h1 className="text-lg font-bold">Primeiro acesso</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Ainda não te conhecemos. Informe seu nome e unidade — na próxima
          assembleia é só mostrar o rosto.
        </p>

        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt="Sua foto"
            className="w-24 h-24 rounded-xl object-cover border border-gray-200 mx-auto mb-4"
          />
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome completo
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bloco
              </label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field"
                maxLength={20}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Apartamento
              </label>
              <input
                value={apartamento}
                onChange={(e) => setApartamento(e.target.value)}
                className="input-field"
                maxLength={20}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Perfil
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="input-field"
            >
              {PERFIS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={lgpd}
              onChange={(e) => setLgpd(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              Concordo que meu rosto e minha foto sejam usados para me identificar
              nas assembleias deste condomínio (LGPD).
            </span>
          </label>
        </div>

        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}

        <button
          onClick={cadastrarEEntrar}
          disabled={processando}
          className="btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {processando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Entrando...
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" /> Confirmar e votar
            </>
          )}
        </button>
        <button
          onClick={onManual}
          className="w-full mt-3 text-sm text-primary-600 hover:text-primary-700 inline-flex items-center justify-center gap-1 font-medium"
        >
          <Camera className="w-4 h-4" /> Prefiro tirar só a selfie
        </button>
        <button
          onClick={onEmail}
          className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1"
        >
          <Mail className="w-4 h-4" /> Ou entrar pelo e-mail
        </button>
      </div>
    );
  }

  // Passo 1: leitura do rosto.
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <ScanFace className="w-6 h-6 text-primary-600" />
        <h1 className="text-lg font-bold">Identifique-se pelo rosto</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Olhe para a câmera para entrar e votar. Se já participou antes, é
        reconhecido na hora.
      </p>

      {camAtiva ? (
        <div className="mb-3 overflow-hidden rounded-xl bg-black aspect-[3/4] max-h-72 mx-auto">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      ) : (
        <div className="mb-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 aspect-[3/4] max-h-72 mx-auto text-gray-400">
          <Camera className="w-10 h-10 mb-2" />
          <span className="text-xs">Câmera desligada</span>
        </div>
      )}

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {camAtiva ? (
        <button
          onClick={lerRosto}
          disabled={processando}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {processando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Lendo rosto...
            </>
          ) : (
            <>
              <ScanFace className="w-4 h-4" /> Ler meu rosto e entrar
            </>
          )}
        </button>
      ) : (
        <button
          onClick={abrirCamera}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> Abrir câmera
        </button>
      )}

      <button
        onClick={onManual}
        className="w-full mt-3 text-sm text-primary-600 hover:text-primary-700 inline-flex items-center justify-center gap-1 font-medium"
      >
        <Camera className="w-4 h-4" /> Não consigo pelo rosto — tirar só a selfie
      </button>
      <button
        onClick={onEmail}
        className="w-full mt-2 text-sm text-gray-500 hover:text-gray-700 inline-flex items-center justify-center gap-1"
      >
        <Mail className="w-4 h-4" /> Ou entrar pelo e-mail
      </button>
    </div>
  );
}

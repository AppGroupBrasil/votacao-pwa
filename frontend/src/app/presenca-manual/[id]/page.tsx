"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Camera,
  RefreshCw,
  Check,
  Eraser,
  CreditCard,
} from "lucide-react";
import { api } from "@/lib/api";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Modelo/marca do aparelho — capturado em silêncio para a auditoria.
async function detectarAparelho(): Promise<string> {
  if (typeof navigator === "undefined") return "";
  const uaData = (navigator as any).userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const hi = await uaData.getHighEntropyValues(["model", "platform"]);
      const partes = [hi.model, hi.platform].filter(Boolean);
      if (partes.length) return partes.join(" ").slice(0, 120);
    } catch {
      /* segue para o fallback */
    }
  }
  return (navigator.userAgent || "").slice(0, 120);
}

export default function PresencaManualPublicaPage() {
  const params = useParams();
  const id = params.id as string;

  const [lista, setLista] = useState<{
    titulo: string;
    ativa: boolean;
    tem_cpf?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [jaPresente, setJaPresente] = useState(false);

  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [selfie, setSelfie] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const marcaAparelho = useRef("");

  // --- portão de CPF: morador digita o CPF e o sistema traz a unidade ---
  const [cpf, setCpf] = useState("");
  const [cpfConfirmado, setCpfConfirmado] = useState(false);
  const [consultandoCpf, setConsultandoCpf] = useState(false);
  const [unidadesCpf, setUnidadesCpf] = useState<
    { nome: string; bloco: string; apartamento: string; perfil: string }[] | null
  >(null);
  const [erroCpf, setErroCpf] = useState("");

  // --- câmera / selfie ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");

  // --- assinatura (canvas) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temAssinatura, setTemAssinatura] = useState(false);

  useEffect(() => {
    detectarAparelho().then((m) => {
      marcaAparelho.current = m;
    });
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .getListaPresencaPublica(id)
      .then((d) => setLista(d))
      .catch(() => setErro("Lista de presença não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

  async function consultarCpf() {
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11 && digitos.length !== 14) {
      setErroCpf("Digite os 11 números do seu CPF.");
      return;
    }
    setConsultandoCpf(true);
    setErroCpf("");
    try {
      const hash = await sha256Hex(digitos);
      const res = await api.consultarCpfPresenca(id, hash);
      setUnidadesCpf(res.unidades);
    } catch {
      setErroCpf("Não consegui consultar agora. Tente de novo em instantes.");
    } finally {
      setConsultandoCpf(false);
    }
  }

  function escolherUnidade(u: {
    nome: string;
    bloco: string;
    apartamento: string;
  }) {
    setNome(u.nome || "");
    setBloco(u.bloco || "");
    setApartamento(u.apartamento || "");
    setCpfConfirmado(true);
  }

  function pularCpf() {
    // Cadastro na hora: segue com os campos em branco para o morador digitar.
    setCpfConfirmado(true);
  }

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamAtiva(false);
  }, []);

  useEffect(() => () => pararCamera(), [pararCamera]);

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
    if (!selfie) {
      setErro("Tire uma selfie para registrar a presença.");
      return;
    }
    if (!temAssinatura) {
      setErro("Assine no campo indicado.");
      return;
    }
    if (!consentimento) {
      setErro("Marque a caixa de concordância (LGPD) para registrar a presença.");
      return;
    }
    const assinatura = canvasRef.current?.toDataURL("image/png") || "";
    setEnviando(true);
    try {
      const r = await api.registrarPresencaManual(id, {
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        selfie,
        assinatura,
        metodo_auth: "selfie",
        marca_aparelho: marcaAparelho.current,
        consentimento_lgpd: consentimento,
        declaracao_veracidade: consentimento,
      });
      if ((r as any)?.ja_presente) setJaPresente(true);
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
        <h1 className="text-xl font-bold mb-1">
          {jaPresente ? "Você já está presente!" : "Presença registrada!"}
        </h1>
        <p className="text-gray-500">
          {jaPresente
            ? `Sua presença nesta assembleia já estava registrada${
                nome.trim() ? `, ${nome.trim()}` : ""
              }.`
            : `Obrigado${nome.trim() ? `, ${nome.trim()}` : ""}.`}
        </p>
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

  // Portão de CPF: primeiro passo. O morador digita o CPF e o sistema já traz
  // nome/bloco/apartamento; depois é só a selfie e a assinatura.
  if (lista && lista.ativa && lista.tem_cpf && !cpfConfirmado) {
    const digitos = cpf.replace(/\D/g, "");
    const cpfValido = digitos.length === 11 || digitos.length === 14;
    return (
      <div className="min-h-screen bg-gray-50 py-6 px-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-xl font-bold mb-1">Lista de presença</h1>
          {lista?.titulo && (
            <p className="text-sm text-gray-500 mb-4">{lista.titulo}</p>
          )}

          <div className="card mb-4">
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <CreditCard className="w-4 h-4 text-primary-600" />
              Digite o seu CPF
            </label>
            <p className="mb-3 text-xs text-gray-500">
              É só digitar o CPF que o sistema encontra a sua unidade e preenche
              tudo automaticamente. Depois você tira a selfie e assina.
            </p>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              onChange={(e) => {
                setCpf(e.target.value);
                setErroCpf("");
                setUnidadesCpf(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cpfValido && !consultandoCpf)
                  consultarCpf();
              }}
              placeholder="000.000.000-00"
              className="input-field w-full text-center tracking-widest text-lg"
              disabled={consultandoCpf}
            />
            <button
              onClick={consultarCpf}
              disabled={!cpfValido || consultandoCpf}
              className="btn-primary w-full mt-3 disabled:opacity-50"
            >
              {consultandoCpf ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Procurando...
                </span>
              ) : (
                "Continuar"
              )}
            </button>
            {erroCpf && <p className="mt-2 text-sm text-red-600">{erroCpf}</p>}

            {unidadesCpf && unidadesCpf.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">
                  {unidadesCpf.length === 1
                    ? "Encontramos a sua unidade:"
                    : "Escolha a unidade (uma de cada vez):"}
                </p>
                {unidadesCpf.map((u, i) => (
                  <button
                    key={i}
                    onClick={() => escolherUnidade(u)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-primary-400 hover:bg-primary-50"
                  >
                    <span className="block font-medium text-gray-800">
                      {u.nome}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {[u.bloco && `Bloco ${u.bloco}`, `Apt ${u.apartamento}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
                {unidadesCpf.length > 1 && (
                  <p className="pt-1 text-xs text-gray-400">
                    Tem mais de uma unidade? Registre uma agora e depois abra o
                    link de novo para a próxima.
                  </p>
                )}
              </div>
            )}

            {unidadesCpf && unidadesCpf.length === 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                Não encontramos esse CPF na lista. Sem problema — você pode se
                cadastrar na hora no botão abaixo.
              </div>
            )}
          </div>

          <button
            onClick={pularCpf}
            className="w-full text-sm text-gray-500 underline underline-offset-2"
          >
            {unidadesCpf && unidadesCpf.length === 0
              ? "Cadastrar meus dados na hora"
              : "Não tenho o CPF em mãos / cadastrar na hora"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">Lista de presença</h1>
        <p className="text-sm text-gray-500 mb-4">{lista?.titulo}</p>

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
            <label className="block text-sm font-medium">Assinatura</label>
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

        {/* LGPD + declaração de veracidade */}
        <label className="mb-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={consentimento}
            onChange={(e) => setConsentimento(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            Concordo com o tratamento dos meus dados (selfie, assinatura, IP e
            aparelho) para registrar a presença nesta assembleia, conforme a
            LGPD (Lei nº 13.709/2018), e declaro que sou a própria pessoa e que
            as informações são verdadeiras.
          </span>
        </label>

        {nome.trim() && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            Registrar presença no lugar de outra pessoa é crime de falsa
            identidade e falsidade ideológica (arts. 307 e 299 do Código Penal),
            com pena de detenção e multa. Cada morador responde apenas por si.
          </div>
        )}

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

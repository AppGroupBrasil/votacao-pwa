"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  Trophy,
  Loader2,
  Eye,
  Printer,
  Camera,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import ConsentimentoGate from "@/components/ConsentimentoGate";
import type {
  EnquetePublica,
  EnqueteResultado,
  CapturaIdentidade,
} from "@/lib/types";

export default function EnquetePublicaPage() {
  const params = useParams();
  const id = params.id as string;

  const [enquete, setEnquete] = useState<EnquetePublica | null>(null);
  const [resultado, setResultado] = useState<EnqueteResultado | null>(null);
  const [selecionada, setSelecionada] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [jaVotou, setJaVotou] = useState(false);
  const [opcaoVotada, setOpcaoVotada] = useState("");
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [selfie, setSelfie] = useState("");
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");
  const [fase, setFase] = useState<"dados" | "consentimento">("dados");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    if (!id) return;
    if (typeof window !== "undefined" && localStorage.getItem(`enquete_${id}`)) {
      setJaVotou(true);
      setOpcaoVotada(localStorage.getItem(`enquete_${id}_opcao`) || "");
    }
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("resultado") === "1"
    ) {
      api.getEnqueteResultado(id).then(setResultado).catch(() => {});
    }
    api
      .getEnquetePublica(id)
      .then(setEnquete)
      .catch(() => setErro("Votação não encontrada."))
      .finally(() => setLoading(false));
  }, [id]);

  function verResultado() {
    api.getEnqueteResultado(id).then(setResultado).catch(() => {});
  }

  useEffect(() => {
    if (jaVotou) verResultado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jaVotou]);

  function votar() {
    if (!selecionada) {
      setErro("Selecione uma resposta.");
      return;
    }
    if (enquete?.exige_identificacao) {
      if (!nome.trim() || !apartamento.trim()) {
        setErro("Informe seu nome e apartamento para votar.");
        return;
      }
      if (!selfie) {
        setErro("Tire uma selfie para votar.");
        return;
      }
      setErro("");
      setFase("consentimento");
      return;
    }
    if (enquete?.voto_aberto && (!nome.trim() || !apartamento.trim())) {
      setErro("Informe seu nome e apartamento para votar.");
      return;
    }
    enviarVoto();
  }

  async function enviarVoto(captura?: CapturaIdentidade) {
    setEnviando(true);
    setErro("");
    try {
      const votante = enquete?.exige_identificacao
        ? {
            nome: nome.trim(),
            bloco: bloco.trim(),
            apartamento: apartamento.trim(),
            selfie,
            assinatura: captura?.assinatura,
            consentimento_lgpd: captura?.consentimento_lgpd,
            declaracao_veracidade: captura?.declaracao_veracidade,
            marca_aparelho: captura?.marca_aparelho,
            geo_lat: captura?.geo_lat,
            geo_lng: captura?.geo_lng,
          }
        : enquete?.voto_aberto
        ? {
            nome: nome.trim(),
            bloco: bloco.trim(),
            apartamento: apartamento.trim(),
          }
        : undefined;
      const r = await api.votarEnquete(id, selecionada, votante);
      const textoOpcao =
        enquete?.opcoes.find((o) => o.id === selecionada)?.texto || "";
      if (typeof window !== "undefined") {
        localStorage.setItem(`enquete_${id}`, "1");
        if (textoOpcao)
          localStorage.setItem(`enquete_${id}_opcao`, textoOpcao);
      }
      setOpcaoVotada(textoOpcao);
      setResultado(r);
      setJaVotou(true);
    } catch (e: any) {
      const msg = e?.response?.data?.error;
      if (e?.response?.status === 409) {
        if (typeof window !== "undefined")
          localStorage.setItem(`enquete_${id}`, "1");
        setJaVotou(true);
        verResultado();
      } else {
        setErro(msg || "Erro ao registrar voto.");
        setFase("dados");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (erro && !enquete) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-gray-500">{erro}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
      <div className="w-full max-w-md mt-8">
        <div className="card">
          <h1 className="text-xl font-bold mb-1">{enquete?.titulo}</h1>
          <p className="text-sm text-gray-500 mb-5">
            {jaVotou || resultado
              ? resultado && !resultado.ativa
                ? "Resultado final da votação"
                : "Votação em andamento"
              : enquete?.exige_identificacao
              ? "Identifique-se com selfie e assinatura para votar."
              : enquete?.voto_aberto
              ? "Votação aberta — identifique-se e escolha uma opção."
              : "Votação anônima — escolha uma opção."}
          </p>

          {!jaVotou &&
            !resultado &&
            enquete?.exige_identificacao &&
            fase === "consentimento" && (
              <>
                <button
                  onClick={() => setFase("dados")}
                  className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <ConsentimentoGate onConcluir={(c) => enviarVoto(c)} />
                {enviando && (
                  <p className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando
                    voto...
                  </p>
                )}
                {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
              </>
            )}

          {!jaVotou &&
            !resultado &&
            !(enquete?.exige_identificacao && fase === "consentimento") && (
              <>
                {enquete?.voto_aberto && !enquete?.exige_identificacao && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Eye className="w-3.5 h-3.5" /> Nesta votação seu voto é
                      identificado.
                    </p>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome completo"
                      className="input-field w-full mb-2"
                    />
                    <div className="flex gap-2">
                      <input
                        value={bloco}
                        onChange={(e) => setBloco(e.target.value)}
                        placeholder="Bloco"
                        className="input-field w-full"
                      />
                      <input
                        value={apartamento}
                        onChange={(e) => setApartamento(e.target.value)}
                        placeholder="Apartamento"
                        className="input-field w-full"
                      />
                    </div>
                  </div>
                )}

                {enquete?.exige_identificacao && (
                  <div className="mb-4 rounded-lg border border-primary-200 bg-primary-50 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium text-primary-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> Identifique-se para
                      votar.
                    </p>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome completo"
                      className="input-field w-full mb-2"
                    />
                    <div className="flex gap-2 mb-3">
                      <input
                        value={bloco}
                        onChange={(e) => setBloco(e.target.value)}
                        placeholder="Bloco"
                        className="input-field w-full"
                      />
                      <input
                        value={apartamento}
                        onChange={(e) => setApartamento(e.target.value)}
                        placeholder="Apartamento"
                        className="input-field w-full"
                      />
                    </div>

                    <p className="mb-1 text-xs font-medium text-primary-700">
                      Selfie
                    </p>
                    {selfie ? (
                      <div className="text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selfie}
                          alt="Selfie"
                          className="mx-auto rounded-lg max-h-52"
                        />
                        <button
                          onClick={() => {
                            setSelfie("");
                            abrirCamera();
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600"
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
                          className="mx-auto rounded-lg max-h-52 bg-black"
                        />
                        <button
                          onClick={capturarSelfie}
                          className="btn-primary mt-2 inline-flex items-center gap-2"
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
                )}

                <div className="space-y-2">
                  {enquete?.opcoes.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setSelecionada(o.id)}
                      className={`w-full text-left rounded-lg border px-4 py-3 transition ${
                        selecionada === o.id
                          ? "border-primary-500 bg-primary-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        {o.texto}
                        {selecionada === o.id && (
                          <Check className="w-4 h-4 text-primary-600" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

                <button
                  onClick={votar}
                  disabled={enviando || !enquete?.ativa}
                  className="btn-primary w-full mt-5 disabled:opacity-50"
                >
                  {!enquete?.ativa
                    ? "Votação encerrada"
                    : enviando
                    ? "Enviando..."
                    : enquete?.exige_identificacao
                    ? "Continuar"
                    : "Confirmar voto"}
                </button>
              </>
            )}

          {jaVotou && opcaoVotada && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                Voto contabilizado para: <strong>{opcaoVotada}</strong>
              </span>
            </div>
          )}
          {resultado && (
            <Resultados resultado={resultado} />
          )}
          {jaVotou && !resultado && (
            <p className="text-sm text-gray-500">Carregando resultado...</p>
          )}
        </div>

        {(jaVotou || resultado) && (
          <p className="text-center text-xs text-gray-400 mt-3">
            Você já votou nesta enquete.
          </p>
        )}
      </div>
    </div>
  );
}

function Resultados({ resultado }: { resultado: EnqueteResultado }) {
  const total = resultado.total_votos;
  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {total} voto{total !== 1 ? "s" : ""} no total
        {resultado.voto_aberto && " · votação aberta"}
      </p>
      <div className="space-y-3">
        {resultado.opcoes.map((o) => {
          const venc = resultado.vencedor?.id === o.id;
          return (
            <div key={o.id}>
              <div className="flex justify-between text-sm mb-1">
                <span
                  className={`flex items-center gap-1 ${
                    venc ? "font-semibold" : ""
                  }`}
                >
                  {venc && <Trophy className="w-4 h-4 text-amber-500" />}
                  {o.texto}
                </span>
                <span className="text-gray-500">
                  {o.votos} ({o.percentual}%)
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    venc ? "bg-amber-400" : "bg-primary-500"
                  }`}
                  style={{ width: `${o.percentual}%` }}
                />
              </div>
              {resultado.voto_aberto &&
                o.votantes &&
                o.votantes.length > 0 && (
                  <ul className="mt-1.5 ml-1 space-y-0.5">
                    {o.votantes.map((v, i) => (
                      <li key={i} className="text-xs text-gray-500">
                        {v.nome}
                        {v.apartamento && (
                          <span className="text-gray-400">
                            {" "}
                            — {v.bloco ? `${v.bloco}/` : ""}
                            {v.apartamento}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          );
        })}
      </div>
      {resultado.ativa && (
        <p className="mt-5 text-xs text-gray-400 text-center">
          Resultado parcial — o vencedor será divulgado quando a votação for
          encerrada.
        </p>
      )}
      {resultado.vencedor && total > 0 && (
        <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Vencedor: <strong>{resultado.vencedor.texto}</strong> com{" "}
          {resultado.vencedor.votos} voto
          {resultado.vencedor.votos !== 1 ? "s" : ""} ({resultado.vencedor.percentual}%)
        </div>
      )}
      <button
        onClick={() => window.print()}
        className="btn-secondary w-full mt-5 flex items-center justify-center gap-2 print:hidden"
      >
        <Printer className="w-4 h-4" /> Gerar PDF
      </button>
    </div>
  );
}

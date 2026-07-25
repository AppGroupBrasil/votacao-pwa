"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Camera,
  RefreshCw,
  Check,
  Eraser,
  ShieldCheck,
  Fingerprint,
  Mail,
  ScanFace,
  HelpCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { loadModels, detectFace, hashDescriptor } from "@/lib/faceapi";
import { isPlatformAuthenticatorAvailable } from "@/lib/webauthn";

type Perfil = "proprietario" | "locatario" | "conjuge" | "procurador" | "outro";
type Metodo = "" | "facial" | "webauthn" | "otp";
type Etapa = "facial" | "digital" | "email";

const PERFIS: { value: Perfil; label: string }[] = [
  { value: "proprietario", label: "Proprietário" },
  { value: "locatario", label: "Locatário" },
  { value: "conjuge", label: "Cônjuge" },
  { value: "procurador", label: "Procurador" },
  { value: "outro", label: "Outro" },
];

function detectarAparelho(): string {
  if (typeof navigator === "undefined") return "";
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) {
    const brands = (uaData.brands || [])
      .map((b: any) => b.brand)
      .filter((b: string) => !/Not.?A.?Brand/i.test(b));
    return [uaData.platform, brands[0]].filter(Boolean).join(" · ").slice(0, 120);
  }
  return (navigator.userAgent || "").slice(0, 120);
}

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
  const [jaPresente, setJaPresente] = useState(false);

  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("proprietario");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [consentimento, setConsentimento] = useState(false);

  // --- cascata de identificação ---
  const [metodo, setMetodo] = useState<Metodo>("");
  const [etapa, setEtapa] = useState<Etapa>("facial");
  const [selfie, setSelfie] = useState("");
  const [assinaturaFacial, setAssinaturaFacial] = useState("");
  const [processandoFacial, setProcessandoFacial] = useState(false);
  // Fluxo facial em 2 etapas: 1) biometria (leitura do rosto) 2) selfie (foto comprovante).
  const [faseFacial, setFaseFacial] = useState<"biometria" | "selfie">("biometria");
  // Vetor facial (128-D) lido do rosto — vira a identidade permanente no servidor.
  const [descriptorFacial, setDescriptorFacial] = useState<number[] | null>(null);
  // Só marca SE o rosto já é conhecido no condomínio — sem trazer nome/unidade
  // (LGPD). Quem está com o aparelho não vê dados de outra pessoa.
  const [reconhecido, setReconhecido] = useState(false);

  // --- digital (WebAuthn) ---
  const [autenticandoDigital, setAutenticandoDigital] = useState(false);

  // --- código por e-mail ---
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);
  const [erroCascata, setErroCascata] = useState("");

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

  useEffect(() => {
    if (camAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camAtiva]);

  async function abrirCamera() {
    setCamErro("");
    if (!consentimento) {
      setCamErro(
        "Marque a concordância com a LGPD (no topo) antes de abrir a câmera."
      );
      return;
    }
    setFaseFacial("biometria"); // sempre começa pela leitura do rosto
    loadModels().catch(() => {});
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

  // Etapa 1: lê a biometria facial (não guarda foto ainda, só confirma o rosto).
  async function escanearRosto() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth) {
      setCamErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    setCamErro("");
    setProcessandoFacial(true);
    try {
      const canvas = capturarFrame(video);
      if (!canvas) return;
      await loadModels();
      const descriptor = await detectFace(canvas);
      if (!descriptor) {
        setCamErro(
          "Não foi possível reconhecer um rosto. Aproxime o rosto, melhore a luz e tente de novo."
        );
        return;
      }
      const hash = await hashDescriptor(descriptor);
      setAssinaturaFacial(hash);
      const arr = Array.from(descriptor);
      setDescriptorFacial(arr);
      // Pergunta ao servidor só se esse rosto já é conhecido no condomínio.
      // Não trazemos nome/unidade: o servidor reusa os dados ao registrar.
      try {
        const r = await api.reconhecerPresencaFacial(id, arr);
        setReconhecido(!!r.encontrado);
      } catch {
        // Se o reconhecimento falhar, segue como cadastro novo.
        setReconhecido(false);
      }
      setFaseFacial("selfie"); // câmera continua aberta para a selfie
    } catch {
      setCamErro("Não foi possível processar o rosto. Tente novamente.");
    } finally {
      setProcessandoFacial(false);
    }
  }

  // Etapa 2: tira a selfie que fica como comprovante da presença.
  function capturarSelfie() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth) {
      setCamErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    setCamErro("");
    const canvas = capturarFrame(video);
    if (!canvas) return;
    setSelfie(canvas.toDataURL("image/jpeg", 0.7));
    setMetodo("facial");
    pararCamera();
  }

  function recusarFacial() {
    pararCamera();
    setSelfie("");
    setAssinaturaFacial("");
    setFaseFacial("biometria");
    setCamErro("");
    setEtapa("digital");
  }

  async function autenticarDigital() {
    setErroCascata("");
    setAutenticandoDigital(true);
    try {
      if (!(await isPlatformAuthenticatorAvailable())) {
        setErroCascata(
          "Este aparelho não tem digital/biometria disponível. Use o código por e-mail."
        );
        setEtapa("email");
        return;
      }
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Votação Online" },
          user: {
            id: userId,
            name: nome.trim() || "morador",
            displayName: nome.trim() || "morador",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });
      if (cred) {
        setMetodo("webauthn");
      } else {
        setErroCascata("Não foi possível confirmar a digital. Tente novamente.");
      }
    } catch {
      setErroCascata(
        "A digital não foi confirmada. Você pode tentar de novo ou usar o código por e-mail."
      );
    } finally {
      setAutenticandoDigital(false);
    }
  }

  async function enviarCodigo() {
    setErroCascata("");
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setErroCascata("Informe um e-mail válido.");
      return;
    }
    setEnviandoCodigo(true);
    try {
      const r = await api.presencaEnviarCodigo(id, e);
      setEmailMasked(r.email_masked);
      setCodigoEnviado(true);
    } catch (err: any) {
      setErroCascata(
        err?.response?.data?.error || "Não foi possível enviar o código."
      );
    } finally {
      setEnviandoCodigo(false);
    }
  }

  async function verificarCodigo() {
    setErroCascata("");
    if (!codigo.trim()) {
      setErroCascata("Digite o código recebido no e-mail.");
      return;
    }
    setVerificandoCodigo(true);
    try {
      await api.presencaVerificarCodigo(id, email.trim().toLowerCase(), codigo.trim());
      setMetodo("otp");
    } catch (err: any) {
      setErroCascata(
        err?.response?.data?.error || "Código inválido ou expirado."
      );
    } finally {
      setVerificandoCodigo(false);
    }
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
    if (!metodo) {
      setErro("Confirme sua identidade (rosto, digital ou código por e-mail).");
      return;
    }
    if (!consentimento) {
      setErro("Marque a caixa de concordância (LGPD) para registrar a presença.");
      return;
    }

    // Caminho facial (padrão): o rosto é a identidade e a assinatura.
    if (metodo === "facial") {
      if (!descriptorFacial) {
        setErro("Leia o rosto novamente para confirmar a identidade.");
        return;
      }
      // Só o primeiro cadastro deste rosto precisa de nome e apartamento.
      if (!reconhecido) {
        if (!nome.trim()) {
          setErro("Informe o seu nome.");
          return;
        }
        if (!apartamento.trim()) {
          setErro("Informe o apartamento.");
          return;
        }
      }
      if (!temAssinatura) {
        setErro("Assine no campo indicado.");
        return;
      }
      const assinaturaFacialDesenho = canvasRef.current?.toDataURL("image/png") || "";
      setEnviando(true);
      try {
        const r = await api.registrarPresencaFacial(id, {
          descriptor: descriptorFacial,
          nome: nome.trim(),
          bloco: bloco.trim(),
          apartamento: apartamento.trim(),
          perfil,
          selfie,
          assinatura: assinaturaFacialDesenho,
          marca_aparelho: detectarAparelho(),
          consentimento_lgpd: consentimento,
          declaracao_veracidade: consentimento,
        });
        if (r.ja_presente) setJaPresente(true);
        setEnviado(true);
      } catch (e: any) {
        setErro(
          e?.response?.data?.error || "Não foi possível registrar a presença."
        );
      } finally {
        setEnviando(false);
      }
      return;
    }

    // Caminho reserva (digital / código por e-mail): mantém a assinatura desenhada.
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
        perfil,
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        email: email.trim().toLowerCase(),
        selfie,
        assinatura,
        metodo_auth: metodo,
        assinatura_facial: assinaturaFacial,
        marca_aparelho: detectarAparelho(),
        consentimento_lgpd: consentimento,
        declaracao_veracidade: consentimento,
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

  const metodoLabel =
    metodo === "facial"
      ? "Identidade confirmada por biometria facial"
      : metodo === "webauthn"
      ? "Identidade confirmada pela digital do aparelho"
      : "Identidade confirmada por código no e-mail";

  // A assinatura confirma os dados: só aparece depois de tudo preenchido.
  // Rosto reconhecido não digita nada (o cadastro já existe no condomínio).
  const dadosCompletos =
    (metodo === "facial" && reconhecido) ||
    (nome.trim() !== "" && apartamento.trim() !== "");

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">Lista de presença</h1>
        <p className="text-sm text-gray-500 mb-4">{lista?.titulo}</p>

        {/* LGPD — consentimento antes de ler o rosto */}
        <label className="mb-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={consentimento}
            onChange={(e) => setConsentimento(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            Concordo com o tratamento dos meus dados pessoais e biométricos para
            registro da presença nesta assembleia do condomínio, conforme a LGPD
            (Lei nº 13.709/2018).
          </span>
        </label>

        {/* Confirmação de identidade (cascata de segurança) */}
        <div className="card mb-4">
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <ShieldCheck className="w-4 h-4 text-primary-600" /> Confirmação de
            identidade
          </label>

          {metodo ? (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
              <Check className="mt-0.5 w-4 h-4 shrink-0" />
              <div className="flex items-center gap-3">
                {selfie && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selfie}
                    alt="Selfie"
                    className="w-12 h-12 rounded-lg object-cover border border-green-200"
                  />
                )}
                <span>{metodoLabel}</span>
              </div>
            </div>
          ) : etapa === "facial" ? (
            <div className="text-center">
              <p className="mb-3 flex items-center justify-center gap-1.5 text-sm text-gray-500">
                <ScanFace className="w-4 h-4" />{" "}
                {faseFacial === "biometria"
                  ? "Primeiro vamos ler o seu rosto."
                  : reconhecido
                  ? "Rosto reconhecido. Agora tire uma selfie."
                  : "Agora tire uma selfie para o comprovante."}
              </p>
              {faseFacial === "biometria" && (
                <p className="mb-3 flex items-start justify-center gap-1.5 text-xs text-gray-400">
                  <HelpCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                  <span>
                    Só é preciso ler o rosto uma vez. Se você já cadastrou a
                    biometria em outra assembleia, será reconhecido
                    automaticamente — não precisa cadastrar de novo.
                  </span>
                </p>
              )}
              {camAtiva ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="mx-auto rounded-lg max-h-60 bg-black"
                  />
                  {faseFacial === "biometria" ? (
                    <button
                      onClick={escanearRosto}
                      disabled={processandoFacial}
                      className="btn-primary mt-3 inline-flex items-center gap-2 disabled:opacity-50"
                    >
                      {processandoFacial ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Lendo seu
                          rosto...
                        </>
                      ) : (
                        <>
                          <ScanFace className="w-4 h-4" /> Ler meu rosto
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={capturarSelfie}
                      className="btn-primary mt-3 inline-flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" /> Tirar selfie
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={abrirCamera}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" /> Abrir câmera
                </button>
              )}
              {camErro && <p className="mt-2 text-sm text-red-600">{camErro}</p>}
              <div className="mt-3">
                <button
                  onClick={recusarFacial}
                  className="text-xs text-gray-400 underline"
                >
                  Não quero fazer a selfie
                </button>
              </div>
            </div>
          ) : etapa === "digital" ? (
            <div className="text-center">
              <p className="mb-3 flex items-center justify-center gap-1.5 text-sm text-gray-500">
                <Fingerprint className="w-4 h-4" /> Use a digital ou o
                desbloqueio do seu celular.
              </p>
              <button
                onClick={autenticarDigital}
                disabled={autenticandoDigital}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {autenticandoDigital ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Aguardando...
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4" /> Usar digital do aparelho
                  </>
                )}
              </button>
              {erroCascata && (
                <p className="mt-2 text-sm text-red-600">{erroCascata}</p>
              )}
              <div className="mt-3 flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    setErroCascata("");
                    setEtapa("facial");
                  }}
                  className="text-xs text-gray-400 underline"
                >
                  Voltar ao rosto
                </button>
                <button
                  onClick={() => {
                    setErroCascata("");
                    setEtapa("email");
                  }}
                  className="text-xs text-gray-400 underline"
                >
                  Não tenho digital
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-sm text-gray-500">
                <Mail className="w-4 h-4" /> Receba um código de confirmação no
                seu e-mail.
              </p>
              {!codigoEnviado ? (
                <div className="space-y-2">
                  <input
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="input-field w-full"
                  />
                  <button
                    onClick={enviarCodigo}
                    disabled={enviandoCodigo}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {enviandoCodigo ? "Enviando..." : "Enviar código"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Enviamos um código para <strong>{emailMasked}</strong>.
                    Digite abaixo.
                  </p>
                  <input
                    inputMode="numeric"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="000000"
                    className="input-field w-full tracking-widest text-center"
                  />
                  <button
                    onClick={verificarCodigo}
                    disabled={verificandoCodigo}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {verificandoCodigo ? "Confirmando..." : "Confirmar código"}
                  </button>
                  <button
                    onClick={enviarCodigo}
                    disabled={enviandoCodigo}
                    className="w-full text-xs text-gray-400 underline"
                  >
                    Reenviar código
                  </button>
                </div>
              )}
              {erroCascata && (
                <p className="mt-2 text-sm text-red-600">{erroCascata}</p>
              )}
              <div className="mt-3 text-center">
                <button
                  onClick={() => {
                    setErroCascata("");
                    setEtapa("digital");
                  }}
                  className="text-xs text-gray-400 underline"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dados */}
        <div className="card mb-4 space-y-3">
          {metodo === "facial" && reconhecido && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <Check className="mt-0.5 w-4 h-4 shrink-0" />
              <span>
                Rosto reconhecido. Seus dados já estão no cadastro do
                condomínio — é só tirar a selfie e confirmar.
              </span>
            </div>
          )}
          {metodo === "facial" && !reconhecido && descriptorFacial && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <ScanFace className="mt-0.5 w-4 h-4 shrink-0" />
              <span>
                Primeiro acesso: preencha nome e apartamento. Da próxima vez o
                seu rosto já será reconhecido.
              </span>
            </div>
          )}
          {/* Rosto já reconhecido não digita nada: o servidor reusa o cadastro. */}
          {!(metodo === "facial" && reconhecido) && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Perfil</label>
                <select
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value as Perfil)}
                  className="input-field w-full"
                >
                  {PERFIS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
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
            </>
          )}
        </div>

        {/* Assinatura — última etapa: só depois de todos os dados preenchidos. */}
        {metodo && dadosCompletos && (
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
        )}

        {/* Declaração de identidade e aviso legal — no fim, junto da assinatura,
            já com o nome capturado, para o morador confirmar que é ele mesmo. */}
        {metodo && dadosCompletos && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <p>
              {nome.trim() ? (
                <>
                  Ao confirmar, <strong>{nome.trim()}</strong> declara que é a
                  própria pessoa e que os dados informados são verdadeiros.
                </>
              ) : (
                <>
                  Ao confirmar, você declara que é a própria pessoa e que os
                  dados informados são verdadeiros.
                </>
              )}
            </p>
            <p className="mt-1.5">
              Registrar presença ou votar no lugar de outra pessoa é crime de
              falsa identidade e falsidade ideológica (arts. 307 e 299 do Código
              Penal), com pena de detenção e multa. Cada morador responde apenas
              por si.
            </p>
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

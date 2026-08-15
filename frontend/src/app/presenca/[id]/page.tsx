"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CheckCircle2,
  Eraser,
  Loader2,
  MapPin,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  Video,
  Wifi,
} from "lucide-react";

import { api, getDeviceId } from "@/lib/api";

const PERFIS = [
  { v: "proprietario", l: "Proprietário" },
  { v: "locatario", l: "Locatário" },
  { v: "conjuge", l: "Cônjuge" },
  { v: "procurador", l: "Procurador" },
  { v: "outro", l: "Outro" },
];

type Publica = {
  id: string;
  titulo: string;
  descricao?: string;
  condominio_nome?: string;
  ativa: boolean;
  modo_rapido?: boolean;
  total_registros?: number;
  tem_sala?: boolean;
};

async function detectarMarca(): Promise<string> {
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

// Lista de presença rápida: sem planilha, sem CPF e sem biometria facial. O
// morador se identifica pela foto e pela assinatura; aparelho, localização e IP
// ficam gravados junto para a mesa poder auditar depois. É a lista para a
// reunião marcada em cima da hora, quando não há tempo de importar planilha.
export default function PresencaRapidaPage() {
  const params = useParams();
  const router = useRouter();
  const listaId = String(params?.id || "");

  const [lista, setLista] = useState<Publica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("proprietario");
  const [selfie, setSelfie] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [veracidade, setVeracidade] = useState(false);

  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{
    aviso: string;
    link_reuniao: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);

  // Captados em silêncio, sem travar nada: quem nega o GPS assina do mesmo jeito.
  const geo = useRef<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const marca = useRef("");
  const [temGeo, setTemGeo] = useState(false);

  useEffect(() => {
    detectarMarca().then((m) => {
      marca.current = m;
    });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geo.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setTemGeo(true);
        },
        () => {
          /* sem permissão: segue sem coordenadas */
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  useEffect(() => {
    if (!listaId) return;
    api
      .getListaPresencaPublica(listaId)
      .then((d) => {
        // Link de lista completa aberto aqui: manda para a tela certa, com CPF
        // e conferência de rosto, em vez de registrar sem conferir nada.
        if (!d?.modo_rapido) {
          router.replace(`/presenca-manual/${listaId}`);
          return;
        }
        setLista(d as Publica);
      })
      .catch((e: any) =>
        setErro(
          e?.response?.status === 429
            ? "Muita gente entrando ao mesmo tempo. Aguarde alguns segundos e recarregue a página."
            : "Lista não encontrada."
        )
      )
      .finally(() => setCarregando(false));
  }, [listaId, router]);

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
      setCamErro("Não foi possível abrir a câmera. Verifique a permissão.");
    }
  }

  function tirarFoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCamErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    setCamErro("");
    const canvas = document.createElement("canvas");
    const max = 640;
    const escala = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfie(canvas.toDataURL("image/jpeg", 0.7));
    pararCamera();
  }

  function posicao(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  function iniciarTraco(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    const p = posicao(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = posicao(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function encerrarTraco() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const canvas = canvasRef.current;
    if (canvas) setAssinatura(canvas.toDataURL("image/png"));
  }

  function limparAssinatura() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setAssinatura("");
  }

  function irParaFoto() {
    if (!nome.trim()) {
      setErro("Informe o seu nome.");
      return;
    }
    if (!apartamento.trim()) {
      setErro("Informe o apartamento/unidade.");
      return;
    }
    setErro("");
    setEtapa(2);
    abrirCamera();
  }

  async function registrar() {
    if (!selfie) {
      setErro("Tire a foto para registrar a presença.");
      return;
    }
    if (!assinatura) {
      setErro("Assine no quadro para registrar a presença.");
      return;
    }
    if (!lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      const r = await api.registrarPresencaManual(listaId, {
        nome: nome.trim(),
        perfil,
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        selfie,
        assinatura,
        metodo_auth: "selfie",
        marca_aparelho: marca.current,
        device_id: getDeviceId(),
        geo_lat: geo.current.lat,
        geo_lng: geo.current.lng,
        consentimento_lgpd: true,
        declaracao_veracidade: veracidade,
      });
      setPronto({
        aviso: r?.aviso || "",
        link_reuniao: r?.link_reuniao || "",
      });
    } catch (e: any) {
      setErro(
        e?.response?.data?.error ||
          "Não foi possível registrar a presença. Tente de novo."
      );
    } finally {
      setEnviando(false);
    }
  }

  function novaPessoa() {
    // Celular passando de mão em mão no salão: a próxima pessoa começa limpa.
    setPronto(null);
    setNome("");
    setBloco("");
    setApartamento("");
    setPerfil("proprietario");
    setSelfie("");
    setAssinatura("");
    setLgpd(false);
    setVeracidade(false);
    setErro("");
    setEtapa(1);
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Abrindo a lista...
      </div>
    );
  }

  if (!lista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-center text-gray-600">
        {erro || "Lista não encontrada."}
      </div>
    );
  }

  const titulo = lista.condominio_nome || lista.titulo;
  const subtitulo = lista.condominio_nome ? lista.titulo : lista.descricao || "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-700 via-primary-600 to-gray-50 pb-12">
      <header className="px-5 pt-8 pb-16 text-white">
        <div className="mx-auto max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
            Lista de presença
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-white/85">{subtitulo}</p>}
          {typeof lista.total_registros === "number" && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm">
              <Users className="h-4 w-4" />
              {lista.total_registros} presença
              {lista.total_registros === 1 ? "" : "s"} registrada
              {lista.total_registros === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-12 max-w-lg px-4">
        {!lista.ativa && !pronto && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-black/5">
            <p className="font-semibold text-gray-900">
              Esta lista de presença está encerrada.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Procure a mesa da assembleia.
            </p>
          </div>
        )}

        {pronto && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-black/5">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-12 w-12 text-green-600" strokeWidth={2.2} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Presença registrada</h2>
            <p className="mt-1 text-gray-600">
              {nome} · {bloco ? `Bloco ${bloco} · ` : ""}
              {apartamento}
            </p>

            {pronto.aviso && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                {pronto.aviso}
              </p>
            )}

            {pronto.link_reuniao && (
              <a
                href={pronto.link_reuniao}
                target="_blank"
                rel="noreferrer"
                className="btn-primary mt-5 inline-flex w-full items-center justify-center gap-2"
              >
                <Video className="h-4 w-4" /> Entrar na sala da assembleia
              </a>
            )}

            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-left ring-1 ring-gray-200">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Guardado com a sua assinatura
              </p>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary-600" /> Foto do momento
                  da assinatura
                </li>
                <li className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-primary-600" /> Assinatura
                  desenhada
                </li>
                <li className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary-600" /> Identificação
                  do aparelho
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary-600" />
                  {temGeo ? "Localização do aparelho" : "Localização não autorizada"}
                </li>
                <li className="flex items-center gap-2">
                  <Wifi className="h-4 w-4 text-primary-600" /> Endereço de rede
                  (IP) e data/hora
                </li>
              </ul>
            </div>

            <button
              onClick={novaPessoa}
              className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Registrar outra pessoa
            </button>
          </div>
        )}

        {lista.ativa && !pronto && (
          <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex flex-1 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      etapa >= n
                        ? "bg-primary-600 text-white"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {etapa > n ? <Check className="h-4 w-4" /> : n}
                  </span>
                  <span
                    className={`h-1 flex-1 rounded-full ${
                      etapa > n ? "bg-primary-600" : "bg-gray-100"
                    }`}
                  />
                </div>
              ))}
            </div>

            {etapa === 1 && (
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <UserRound className="h-5 w-5 text-primary-600" /> Quem é você
                </h2>
                <p className="mb-4 text-sm text-gray-500">
                  Escreva do jeito que consta na sua unidade.
                </p>

                <label className="mb-1 block text-sm font-medium">
                  Nome completo
                </label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Maria de Souza"
                  className="input-field mb-4"
                  autoComplete="name"
                />

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Bloco/Torre
                    </label>
                    <input
                      value={bloco}
                      onChange={(e) => setBloco(e.target.value)}
                      placeholder="Opcional"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Apartamento
                    </label>
                    <input
                      value={apartamento}
                      onChange={(e) => setApartamento(e.target.value)}
                      placeholder="Ex.: 101"
                      className="input-field"
                    />
                  </div>
                </div>

                <label className="mb-1 block text-sm font-medium">
                  Você é
                </label>
                <div className="mb-5 flex flex-wrap gap-2">
                  {PERFIS.map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setPerfil(p.v)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors ${
                        perfil === p.v
                          ? "bg-primary-600 text-white ring-primary-600"
                          : "bg-white text-gray-600 ring-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>

                {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

                <button
                  onClick={irParaFoto}
                  className="btn-primary w-full text-base"
                >
                  Continuar
                </button>
              </div>
            )}

            {etapa === 2 && (
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <Camera className="h-5 w-5 text-primary-600" /> Sua foto
                </h2>
                <p className="mb-4 text-sm text-gray-500">
                  A foto vale como a sua identificação nesta lista. Nenhum rosto é
                  medido nem comparado: ela fica guardada apenas como registro.
                </p>

                <div className="relative overflow-hidden rounded-2xl bg-gray-900 ring-1 ring-black/10">
                  {selfie ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={selfie} alt="Sua foto" className="w-full" />
                  ) : (
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="aspect-[3/4] w-full scale-x-[-1] object-cover"
                    />
                  )}
                  {!selfie && !camAtiva && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-sm text-white/80">
                      Abrindo a câmera...
                    </div>
                  )}
                </div>

                {camErro && (
                  <p className="mt-3 text-sm text-red-600">{camErro}</p>
                )}

                <div className="mt-4 flex gap-2">
                  {selfie ? (
                    <>
                      <button
                        onClick={() => {
                          setSelfie("");
                          abrirCamera();
                        }}
                        className="btn-secondary flex-1"
                      >
                        Tirar outra
                      </button>
                      <button
                        onClick={() => {
                          setErro("");
                          setEtapa(3);
                        }}
                        className="btn-primary flex-1"
                      >
                        Continuar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={camAtiva ? tirarFoto : abrirCamera}
                      className="btn-primary w-full text-base"
                    >
                      {camAtiva ? "Tirar foto" : "Abrir câmera"}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => {
                    pararCamera();
                    setEtapa(1);
                  }}
                  className="mt-3 w-full text-sm text-gray-500 hover:underline"
                >
                  Voltar
                </button>
              </div>
            )}

            {etapa === 3 && (
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                  <PenLine className="h-5 w-5 text-primary-600" /> Sua assinatura
                </h2>
                <p className="mb-3 text-sm text-gray-500">
                  Assine com o dedo, como na lista de papel.
                </p>

                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  onPointerDown={iniciarTraco}
                  onPointerMove={mover}
                  onPointerUp={encerrarTraco}
                  onPointerLeave={encerrarTraco}
                  className="w-full touch-none rounded-xl border-2 border-dashed border-gray-300 bg-gray-50"
                />
                <button
                  onClick={limparAssinatura}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:underline"
                >
                  <Eraser className="h-4 w-4" /> Apagar e assinar de novo
                </button>

                <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={lgpd}
                    onChange={(e) => setLgpd(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Autorizo o registro da minha foto, assinatura, aparelho,
                    localização e IP para comprovar a minha presença nesta
                    assembleia (LGPD).
                  </span>
                </label>
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={veracidade}
                    onChange={(e) => setVeracidade(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Declaro que os dados acima são verdadeiros e que sou a pessoa
                    da foto.
                  </span>
                </label>

                {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

                <button
                  onClick={registrar}
                  disabled={enviando}
                  className="btn-primary mt-4 flex w-full items-center justify-center gap-2 text-base"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" /> Registrar presença
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    // O quadro volta em branco quando ela retorna: a assinatura
                    // guardada tem que sumir junto, senão salva um traço que
                    // não está mais na tela.
                    setAssinatura("");
                    setErro("");
                    setEtapa(2);
                  }}
                  className="mt-3 w-full text-sm text-gray-500 hover:underline"
                >
                  Voltar
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mx-auto mt-6 max-w-sm text-center text-xs text-gray-500">
          Presença registrada com foto, assinatura, aparelho, localização e IP.
          Sem biometria facial.
        </p>
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Eraser,
  FileText,
  Loader2,
  MapPin,
  PenLine,
  Printer,
  Share2,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  Video,
  Wifi,
} from "lucide-react";

import { api, getDeviceId } from "@/lib/api";
import { documentoValido, hashDocumento, mascararDocumento } from "@/lib/cpf";
import type { ComprovantePresenca } from "@/lib/types";

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

function horaBrasilia(iso: string, comData = true) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(comData
      ? { dateStyle: "short", timeStyle: "medium" }
      : { hour: "2-digit", minute: "2-digit" }),
  });
}

function Dado({
  rotulo,
  children,
  empilhado = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  // Ao lado da foto sobra pouca largura: rótulo em cima, valor embaixo.
  empilhado?: boolean;
}) {
  if (empilhado) {
    return (
      <div className="py-1">
        <dt className="text-xs text-gray-500">{rotulo}</dt>
        <dd className="break-words font-semibold text-gray-900">{children || "—"}</dd>
      </div>
    );
  }
  return (
    <div className="flex gap-x-2 py-1.5">
      <dt className="w-28 shrink-0 text-gray-500">{rotulo}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium text-gray-900">
        {children || "—"}
      </dd>
    </div>
  );
}

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

// Lista de presença manual: sem planilha e sem biometria facial. O morador se
// identifica pela foto, pelo CPF e pela assinatura, e pode deixar uma
// observação (procurador, pagamento feito hoje); aparelho, localização e IP
// ficam gravados junto para a mesa poder auditar depois. O síndico escolhe
// este modo ao criar a lista, no lugar da biometria facial.
export default function PresencaRapidaPage() {
  const params = useParams();
  const router = useRouter();
  const listaId = String(params?.id || "");

  const [lista, setLista] = useState<Publica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("proprietario");
  const [observacao, setObservacao] = useState("");
  const [selfie, setSelfie] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [lgpd, setLgpd] = useState(false);
  const [veracidade, setVeracidade] = useState(false);

  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{
    aviso: string;
    link_reuniao: string;
    jaPresente: boolean;
    registradoEm: string;
    comprovante: ComprovantePresenca | null;
  } | null>(null);
  // No lugar de "registrar outra pessoa": o comprovante de quem registrou.
  const [verComprovante, setVerComprovante] = useState(false);
  const arquivoPdf = useRef<File | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

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
    if (!documentoValido(cpf)) {
      setErro("Confira o CPF: os números digitados não formam um CPF válido.");
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
        cpf_hash: await hashDocumento(cpf),
        cpf_mascarado: mascararDocumento(cpf),
        observacao: observacao.trim(),
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
        jaPresente: !!r?.ja_presente,
        registradoEm: r?.registrado_em || "",
        comprovante: r?.comprovante || null,
      });
      // O contador do topo acompanha a presença que acabou de entrar.
      if (!r?.ja_presente)
        setLista((l) =>
          l && typeof l.total_registros === "number"
            ? { ...l, total_registros: l.total_registros + 1 }
            : l
        );
    } catch (e: any) {
      setErro(
        e?.response?.data?.error ||
          "Não foi possível registrar a presença. Tente de novo."
      );
    } finally {
      setEnviando(false);
    }
  }

  const tokenComprovante = pronto?.comprovante?.token || "";
  const urlComprovante = tokenComprovante
    ? api.urlComprovantePresenca(tokenComprovante)
    : "";

  // O PDF já vem baixado quando a pessoa toca em Compartilhar: o celular só
  // aceita compartilhar arquivo logo depois do toque, sem espera no meio.
  useEffect(() => {
    arquivoPdf.current = null;
    if (!urlComprovante) return;
    let ativo = true;
    fetch(urlComprovante)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (ativo)
          arquivoPdf.current = new File([b], "comprovante-presenca.pdf", {
            type: "application/pdf",
          });
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [urlComprovante]);

  async function compartilharComprovante() {
    if (!urlComprovante) return;
    const arquivo = arquivoPdf.current;
    try {
      if (arquivo && navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: "Comprovante de presença" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Comprovante de presença", url: urlComprovante });
        return;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
    // Sem compartilhamento no navegador: copia o link do PDF.
    try {
      await navigator.clipboard.writeText(urlComprovante);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    } catch {
      /* sem área de transferência: o botão do PDF continua valendo */
    }
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
  const comprovante = pronto?.comprovante || null;

  const botoesComprovante = urlComprovante ? (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <a
        href={urlComprovante}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary inline-flex items-center justify-center gap-2"
      >
        <Printer className="h-4 w-4" /> Baixar / imprimir PDF
      </a>
      <button
        onClick={compartilharComprovante}
        className="btn-secondary inline-flex items-center justify-center gap-2"
      >
        <Share2 className="h-4 w-4" />
        {linkCopiado ? "Link copiado!" : "Compartilhar"}
      </button>
    </div>
  ) : null;

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

        {pronto && verComprovante && comprovante?.numero && (
          <div className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-black/5 sm:p-6">
            <div className="border-b border-gray-100 pb-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                Comprovante de presença
              </p>
              <h2 className="mt-1 text-lg font-bold leading-tight text-gray-900">
                {titulo}
              </h2>
              {subtitulo && <p className="text-sm text-gray-500">{subtitulo}</p>}
            </div>

            <div className="mt-4 flex flex-wrap items-start gap-4">
              {selfie && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selfie}
                  alt="Sua foto"
                  className="h-36 w-28 shrink-0 rounded-xl object-cover ring-1 ring-gray-200"
                />
              )}
              <dl className="min-w-0 flex-1 basis-40 text-sm">
                <Dado empilhado rotulo="Nome">{nome}</Dado>
                <Dado empilhado rotulo="CPF">{comprovante.cpf_mascarado}</Dado>
                <Dado empilhado rotulo="Unidade">
                  {[bloco && `Bloco ${bloco}`, apartamento && `Apto ${apartamento}`]
                    .filter(Boolean)
                    .join(" · ")}
                </Dado>
                <Dado empilhado rotulo="Perfil">
                  {PERFIS.find((p) => p.v === perfil)?.l}
                </Dado>
                <Dado empilhado rotulo="Data e hora">
                  {comprovante.registrado_em
                    ? `${horaBrasilia(comprovante.registrado_em)} (Brasília)`
                    : ""}
                </Dado>
                <Dado empilhado rotulo="Nº do registro">{comprovante.numero}</Dado>
              </dl>
            </div>

            {observacao.trim() && (
              <div className="mt-4 whitespace-pre-line break-words rounded-lg bg-yellow-50 px-3 py-2 text-sm text-gray-800 ring-1 ring-yellow-200">
                <span className="font-semibold">Observações:</span> {observacao.trim()}
              </div>
            )}

            {assinatura && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Assinatura
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assinatura}
                  alt="Sua assinatura"
                  className="h-24 w-full rounded-lg border border-gray-200 bg-white object-contain"
                />
              </div>
            )}

            <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100 text-sm">
              <Dado rotulo="Localização">
                {geo.current.lat != null && geo.current.lng != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${geo.current.lat},${geo.current.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-700 underline underline-offset-2"
                  >
                    {geo.current.lat.toFixed(6)}, {geo.current.lng.toFixed(6)}
                  </a>
                ) : (
                  "Não autorizada no aparelho"
                )}
              </Dado>
              <Dado rotulo="Aparelho">{comprovante.aparelho}</Dado>
              <Dado rotulo="Sistema">{comprovante.sistema}</Dado>
              <Dado rotulo="Identificação do aparelho">
                <span className="break-all">{comprovante.device_id}</span>
              </Dado>
              <Dado rotulo="Endereço de rede (IP)">{comprovante.ip}</Dado>
            </dl>

            {botoesComprovante}
            <button
              onClick={() => setVerComprovante(false)}
              className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          </div>
        )}

        {pronto && !(verComprovante && comprovante?.numero) && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-black/5">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-12 w-12 text-green-600" strokeWidth={2.2} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {pronto.jaPresente ? "Você já está presente" : "Presença registrada"}
            </h2>
            <p className="mt-1 text-gray-600">
              {nome} · {bloco ? `Bloco ${bloco} · ` : ""}
              {apartamento}
            </p>
            {pronto.jaPresente && (
              <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-200">
                Este CPF já registrou presença para esta unidade
                {pronto.registradoEm
                  ? ` às ${horaBrasilia(pronto.registradoEm, false)}`
                  : ""}
                . Não é preciso registrar de novo.
                {!urlComprovante &&
                  " O comprovante fica no aparelho em que a presença foi registrada."}
              </p>
            )}

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

            {!pronto.jaPresente && (
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
            )}

            {/* Cada pessoa registra a própria presença, no próprio celular:
                o antigo "Registrar outra pessoa" deixava a mesma pessoa
                entrar várias vezes. */}
            {comprovante?.numero ? (
              <button
                onClick={() => setVerComprovante(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                <FileText className="h-5 w-5" /> Emitir comprovante de presença
              </button>
            ) : (
              botoesComprovante
            )}
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
                  maxLength={200}
                  placeholder="Ex.: Maria de Souza"
                  className="input-field mb-4"
                  autoComplete="name"
                />

                <label className="mb-1 block text-sm font-medium">CPF</label>
                <input
                  value={cpf}
                  onChange={(e) => {
                    setCpf(e.target.value);
                    setErro("");
                  }}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={18}
                  className="input-field mb-4 tracking-wider"
                />

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Bloco/Torre
                    </label>
                    <input
                      value={bloco}
                      onChange={(e) => setBloco(e.target.value)}
                      maxLength={20}
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
                      maxLength={20}
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

                <label className="mb-1 block text-sm font-medium">
                  Observações{" "}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: sou procurador do apto 302; efetuei o pagamento hoje"
                  rows={3}
                  maxLength={500}
                  className="input-field mb-5"
                />

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
                <p className="mb-3 text-sm font-medium text-gray-700">
                  Assine conforme a sua assinatura.
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

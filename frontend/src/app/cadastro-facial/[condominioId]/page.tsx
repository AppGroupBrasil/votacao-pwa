"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CreditCard,
  Loader2,
  Pencil,
  ScanFace,
  Sun,
  UserCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Leitura } from "@/lib/faceapi";
import { textoRegra, type RegraCadastro } from "@/lib/regraCadastro";
import { useAutoCaptura, textoDica } from "@/lib/useAutoCaptura";
import RegraCadastroAviso from "@/components/RegraCadastroAviso";

// Carregado só no navegador: o TensorFlow do reconhecimento quebra quando o
// servidor tenta montar a página, e ela sairia com erro 500.
const faceapiLib = () => import("@/lib/faceapi");

// O cadastro vira o documento do morador em todas as assembleias, então é mais
// exigente que a leitura da porta (0.6 / 90 px): aqui não há fila esperando.
const SCORE_CADASTRO = 0.7;
const LARGURA_CADASTRO = 120;
const AMOSTRAS = 6;
const INTERVALO_AMOSTRAS_MS = 350;
const MINIMO_LEITURAS = 3;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function textoUnidade(bloco: string, apartamento: string) {
  return [
    bloco?.trim() && `Bloco ${bloco.trim()}`,
    apartamento?.trim() && `Apto ${apartamento.trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function leituraDeCadastro(l: Leitura) {
  return l.score >= SCORE_CADASTRO && l.largura >= LARGURA_CADASTRO;
}

type Unidade = { nome: string; bloco: string; apartamento: string };
type Etapa =
  | "carregando"
  | "indisponivel"
  | "explicacao"
  | "fechado"
  | "cpf"
  | "confirmar"
  | "dados"
  | "camera"
  | "pronto";

// Com planilha, quem cai aqui costuma representar a unidade; sem planilha com
// CPF, todo morador passa por aqui e o normal é ser o proprietário.
const PERFIS_FORA_DA_PLANILHA = [
  { v: "procurador", l: "Procurador (tenho procuração)" },
  { v: "locatario", l: "Locatário" },
  { v: "conjuge", l: "Cônjuge do proprietário" },
  { v: "proprietario", l: "Proprietário (não estou na planilha)" },
  { v: "outro", l: "Outro" },
];
const PERFIS_SEM_PLANILHA = [
  { v: "proprietario", l: "Proprietário" },
  { v: "locatario", l: "Locatário" },
  { v: "conjuge", l: "Cônjuge do proprietário" },
  { v: "procurador", l: "Procurador (tenho procuração)" },
  { v: "outro", l: "Outro" },
];

/**
 * Cadastro antecipado do rosto. O morador faz com calma, dias antes; no dia da
 * assembleia sobra só digitar o CPF e olhar para a câmera, sem aceite, sem
 * conferir dados e sem baixar de novo os modelos (ficam guardados no aparelho).
 */
export default function CadastroFacialPage() {
  const params = useParams();
  const condominioId = params.condominioId as string;

  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [condominioNome, setCondominioNome] = useState("");
  const [erroLink, setErroLink] = useState("");
  const [regra, setRegra] = useState<RegraCadastro | null>(null);

  const [cpf, setCpf] = useState("");
  const [cpfHash, setCpfHash] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [erroCpf, setErroCpf] = useState("");
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [temRosto, setTemRosto] = useState(false);
  const [naoSouEu, setNaoSouEu] = useState(false);

  // Quem não está na planilha declara a unidade que representa.
  const [foraDaPlanilha, setForaDaPlanilha] = useState(false);
  const [temPlanilha, setTemPlanilha] = useState(true);
  const [mensagemPlanilha, setMensagemPlanilha] = useState("");
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("procurador");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [lgpd, setLgpd] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [selfie, setSelfie] = useState("");
  const [nomeCadastrado, setNomeCadastrado] = useState("");

  useEffect(() => {
    api
      .cadastroFacialInfo(condominioId)
      .then((r) => {
        setCondominioNome(r.condominio_nome);
        setRegra(r.regra);
        // Com a regra ligada, a primeira tela explica o prazo e o porquê.
        setEtapa(!r.regra ? "cpf" : r.regra.fechado ? "fechado" : "explicacao");
      })
      .catch((e) => {
        setErroLink(
          e?.response?.status === 404
            ? "Link inválido. Confira o endereço enviado pelo condomínio."
            : "Não foi possível abrir o cadastro agora. Tente de novo em instantes."
        );
        setEtapa("indisponivel");
      });
    // Os modelos começam a baixar já na abertura: quando a pessoa chegar na
    // câmera, a leitura está pronta.
    faceapiLib()
      .then((f) => f.loadModels())
      .catch(() => {});
    return () => pararCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condominioId]);

  useEffect(() => {
    if (camAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camAtiva]);

  const dicaAuto = useAutoCaptura({
    video: videoRef,
    ativo: camAtiva && etapa === "camera" && lgpd && !processando && !erro,
    onCapturar: () => capturar(),
  });

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamAtiva(false);
  }

  async function abrirCamera() {
    setErro("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamAtiva(true);
    } catch {
      setErro(
        "Não foi possível abrir a câmera. Libere a permissão da câmera para este site e tente de novo."
      );
    }
  }

  async function consultarCpf() {
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11 && digitos.length !== 14) {
      setErroCpf("Digite os 11 números do seu CPF.");
      return;
    }
    setConsultando(true);
    setErroCpf("");
    try {
      const hash = await sha256Hex(digitos);
      const r = await api.cadastroFacialConsultarCpf(condominioId, hash);
      setCpfHash(hash);
      setTemRosto(r.tem_rosto);
      setNaoSouEu(false);
      if (!r.encontrado) {
        setForaDaPlanilha(true);
        setTemPlanilha(r.tem_planilha);
        setPerfil(r.tem_planilha ? "procurador" : "proprietario");
        setMensagemPlanilha(r.mensagem);
        setUnidades([]);
        setEtapa("dados");
        return;
      }
      setForaDaPlanilha(false);
      setUnidades(r.unidades);
      setEtapa("confirmar");
    } catch {
      setErroCpf("Não consegui consultar agora. Tente de novo em instantes.");
    } finally {
      setConsultando(false);
    }
  }

  function irParaCamera() {
    setErro("");
    setEtapa("camera");
    if (!camAtiva) abrirCamera();
  }

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    if (!lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const canvas = document.createElement("canvas");
      const escala = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * escala);
      canvas.height = Math.round(video.videoHeight * escala);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const foto = canvas.toDataURL("image/jpeg", 0.8);

      const { loadModels, capturarLeituras } = await faceapiLib();
      await loadModels();
      // Leituras espaçadas: a pessoa respira e mexe o rosto de leve entre uma e
      // outra, e o cadastro passa a cobrir essas pequenas variações.
      const leituras = await capturarLeituras(video, AMOSTRAS, INTERVALO_AMOSTRAS_MS);
      const boas = leituras.filter(leituraDeCadastro);
      if (boas.length < MINIMO_LEITURAS) {
        setErro(
          !leituras.length
            ? "Não encontrei um rosto. Encaixe o rosto na moldura, de frente para a câmera."
            : "A imagem ficou escura ou o rosto ficou longe. Vá para um lugar mais claro, aproxime o celular e tente de novo."
        );
        return;
      }

      const r = await api.cadastroFacialSalvar(condominioId, {
        cpf_hash: cpfHash,
        descriptors: boas.map((l) => Array.from(l.descriptor)),
        selfie: foto,
        consentimento_lgpd: true,
        ...(foraDaPlanilha
          ? {
              nome: nome.trim(),
              bloco: bloco.trim(),
              apartamento: apartamento.trim(),
              perfil,
            }
          : {}),
      });
      setSelfie(foto);
      setNomeCadastrado(r.nome);
      pararCamera();
      setEtapa("pronto");
    } catch (e: any) {
      if (e?.response?.data?.cadastro_fechado) {
        // O prazo venceu enquanto a pessoa fazia o cadastro.
        pararCamera();
        setRegra((atual) => (atual ? { ...atual, fechado: true } : atual));
        setErroLink(e.response.data.error);
        setEtapa("fechado");
        return;
      }
      setErro(
        e?.response?.data?.error ||
          "Não foi possível salvar o cadastro. Verifique a internet e tente de novo."
      );
    } finally {
      setProcessando(false);
    }
  }

  const principal = unidades[0];

  let conteudo: React.ReactNode;

  if (etapa === "carregando") {
    conteudo = (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  } else if (etapa === "indisponivel") {
    conteudo = (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{erroLink}</span>
      </div>
    );
  } else if (etapa === "explicacao" && regra) {
    // Tela explicativa: o prazo, o que acontece depois dele e o porquê.
    conteudo = (
      <div>
        {regra.assembleia_titulo && (
          <p className="mb-3 text-sm text-gray-600">
            Assembleia: <strong className="text-gray-900">{regra.assembleia_titulo}</strong>
          </p>
        )}
        <RegraCadastroAviso prazo={regra.prazo} fechado={false} porqueAberto />
        <button onClick={() => setEtapa("cpf")} className="btn-primary mt-4 w-full">
          Começar meu cadastro
        </button>
      </div>
    );
  } else if (etapa === "fechado" && regra) {
    conteudo = (
      <div>
        {regra.assembleia_titulo && (
          <p className="mb-3 text-sm text-gray-600">
            Assembleia: <strong className="text-gray-900">{regra.assembleia_titulo}</strong>
          </p>
        )}
        <RegraCadastroAviso prazo={regra.prazo} fechado porqueAberto />
        <p className="mt-3 text-xs text-gray-500">
          Já se cadastrou antes? Então está tudo certo: no dia, é só entrar pelo
          link da assembleia, digitar o CPF e olhar para a câmera.
        </p>
      </div>
    );
  } else if (etapa === "cpf") {
    const digitos = cpf.replace(/\D/g, "");
    const cpfValido = digitos.length === 11 || digitos.length === 14;
    conteudo = (
      <div>
        <p className="mb-4 text-sm text-gray-600">
          Cadastre seu rosto agora, com calma. No dia da assembleia é só digitar
          o CPF e olhar para a câmera — sem fila e sem preencher nada.
        </p>
        {regra && !regra.fechado && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {textoRegra(regra.prazo, false).texto}
          </p>
        )}
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-primary-600" />
          Digite o seu CPF
        </label>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={cpf}
          onChange={(e) => {
            setCpf(e.target.value);
            setErroCpf("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cpfValido && !consultando) consultarCpf();
          }}
          placeholder="000.000.000-00"
          className="input-field w-full text-center text-lg tracking-widest"
          disabled={consultando}
        />
        <button
          onClick={consultarCpf}
          disabled={!cpfValido || consultando}
          className="btn-primary mt-3 w-full disabled:opacity-50"
        >
          {consultando ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Procurando...
            </span>
          ) : (
            "Continuar"
          )}
        </button>
        {erroCpf && <p className="mt-3 text-sm text-red-600">{erroCpf}</p>}
      </div>
    );
  } else if (etapa === "dados") {
    // CPF fora da planilha: procurador, locatário ou proprietário que a
    // administradora ainda não incluiu. A administração confere antes do dia.
    conteudo = (
      <div>
        {temPlanilha ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{mensagemPlanilha}</span>
          </div>
        ) : (
          <p className="mb-4 text-sm font-medium text-gray-800">{mensagemPlanilha}</p>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome completo</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field w-full"
              placeholder="Como está no seu documento"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Bloco</label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field w-full"
                placeholder="A"
                maxLength={20}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Apartamento</label>
              <input
                value={apartamento}
                onChange={(e) => setApartamento(e.target.value)}
                className="input-field w-full"
                placeholder="305"
                maxLength={20}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Você é o que na unidade?
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="input-field w-full"
            >
              {(temPlanilha ? PERFIS_FORA_DA_PLANILHA : PERFIS_SEM_PLANILHA).map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
            {perfil === "procurador" && (
              <p className="mt-1 text-xs text-gray-500">
                Envie a procuração para a administração antes da assembleia.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={irParaCamera}
          disabled={!nome.trim() || !apartamento.trim()}
          className="btn-primary mt-4 w-full disabled:opacity-50"
        >
          Continuar para a foto
        </button>
        <button
          onClick={() => setEtapa("cpf")}
          className="mt-3 w-full text-sm text-gray-500 underline underline-offset-2"
        >
          Digitar o CPF de novo
        </button>
      </div>
    );
  } else if (etapa === "confirmar") {
    conteudo = (
      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserCheck className="h-4 w-4 text-primary-600" />
          Confirme se é você
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <p className="text-lg font-semibold leading-tight text-gray-900">
            {principal?.nome || "—"}
          </p>
          {unidades.map((u, i) => (
            <p key={i} className="mt-1 text-sm text-gray-700">
              {textoUnidade(u.bloco, u.apartamento) || "Unidade não informada"}
            </p>
          ))}
        </div>
        {temRosto && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
            Você já tem rosto cadastrado. Pode refazer agora para melhorar a
            leitura — a foto nova precisa bater com a atual.
          </p>
        )}
        {naoSouEu ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Confira se o CPF foi digitado certo. Se estiver certo e os dados
              não forem seus, a planilha da administradora está desatualizada:
              procure a administração do condomínio
              {regra ? " antes do prazo do cadastro." : ". No dia da assembleia você entra normalmente e corrige os dados na hora."}
            </span>
          </div>
        ) : (
          <button onClick={irParaCamera} className="btn-primary mt-4 w-full">
            Sim, sou eu
          </button>
        )}
        <button
          onClick={() => (naoSouEu ? setEtapa("cpf") : setNaoSouEu(true))}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          {naoSouEu ? "Digitar o CPF de novo" : "Não sou eu"}
        </button>
      </div>
    );
  } else if (etapa === "camera") {
    conteudo = (
      <div>
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-gray-800">
            <Sun className="h-4 w-4 text-amber-500" /> Para a foto sair boa
          </p>
          Lugar claro, com a luz de frente (não de costas para a janela). Tire
          boné e óculos escuros. Celular na altura dos olhos e rosto de frente.
        </div>

        {camAtiva ? (
          <div className="relative mx-auto mb-3 aspect-[3/4] max-h-80 overflow-hidden rounded-xl bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            <div
              className={`pointer-events-none absolute inset-x-8 inset-y-6 rounded-[50%] border-2 border-dashed transition-colors ${
                dicaAuto === "pronto" || dicaAuto === "segure"
                  ? "border-green-400"
                  : "border-white/60"
              }`}
            />
          </div>
        ) : (
          <div className="mx-auto mb-3 flex aspect-[3/4] max-h-80 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
            <Camera className="mb-2 h-10 w-10" />
            <span className="text-xs">Câmera desligada</span>
          </div>
        )}

        <label className="mb-3 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={lgpd}
            onChange={(e) => setLgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            Concordo que meu rosto e minha foto sejam usados para me identificar
            nas assembleias deste condomínio (LGPD).
          </span>
        </label>

        {camAtiva && !erro && (
          <p className="mb-3 text-center text-sm text-gray-500">
            {processando
              ? "Fique parado, olhando para a câmera..."
              : !lgpd
              ? "Marque o aceite acima para a foto ser tirada."
              : textoDica(dicaAuto) || "Olhe para a câmera. A foto sai sozinha."}
          </p>
        )}

        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

        {camAtiva ? (
          <button
            // Depois de um erro, limpar a mensagem religa a captura automática:
            // a foto só sai quando o rosto estiver enquadrado de novo.
            onClick={erro ? () => setErro("") : capturar}
            disabled={processando || !lgpd}
            className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            {processando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Lendo o rosto...
              </>
            ) : (
              <>
                <ScanFace className="h-4 w-4" /> {erro ? "Tentar de novo" : "Tirar a foto agora"}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={abrirCamera}
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" /> Abrir câmera
          </button>
        )}
      </div>
    );
  } else {
    conteudo = (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-12 w-12 text-green-600" strokeWidth={2.2} />
        </div>
        <h1 className="text-2xl font-extrabold text-green-700">Rosto cadastrado</h1>
        {(nomeCadastrado || principal?.nome) && (
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {nomeCadastrado || principal?.nome}
          </p>
        )}
        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt="Sua foto"
            className="mx-auto mt-4 h-24 w-24 rounded-xl border-2 border-green-500 object-cover"
          />
        )}
        <div className="mt-5 rounded-xl bg-primary-50 px-4 py-3 text-left text-sm text-gray-700">
          <p className="mb-1 font-semibold text-gray-900">No dia da assembleia</p>
          Abra o link enviado pelo condomínio, digite o seu CPF e olhe para a
          câmera. De preferência use este mesmo celular: a leitura fica mais
          rápida.
          {foraDaPlanilha && (
            <p className="mt-2">
              {temPlanilha ? "Como seu CPF não está na planilha, a" : "A"} administração
              confere seus dados{perfil === "procurador" ? " e a procuração" : ""} antes
              da assembleia.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4 py-8">
      <div className="card w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="App Votação" className="h-11 w-11" />
          <div className="min-w-0">
            <p className="font-bold leading-tight">Cadastro do rosto</p>
            {condominioNome && (
              <p className="truncate text-sm text-gray-500">{condominioNome}</p>
            )}
          </div>
        </div>
        {conteudo}
      </div>
    </div>
  );
}

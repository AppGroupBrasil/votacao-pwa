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
  ScanFace,
  Video,
  Lock,
  UserCheck,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

// O face-api só existe no navegador: carregado sob demanda para não quebrar a
// renderização da página no servidor.
import { useAutoCaptura, textoDica } from "@/lib/useAutoCaptura";

const faceapiLib = () => import("@/lib/faceapi");

// Cantos de enquadramento (estilo câmera de reconhecimento) desenhados por cima
// da moldura: dão o ar de "leitura biométrica" sem cobrir o rosto.
function CantosFoco({ cor }: { cor: string }) {
  const base = `pointer-events-none absolute h-7 w-7 ${cor}`;
  return (
    <>
      <span className={`${base} left-2.5 top-2.5 rounded-tl-xl border-l-2 border-t-2`} />
      <span className={`${base} right-2.5 top-2.5 rounded-tr-xl border-r-2 border-t-2`} />
      <span className={`${base} bottom-2.5 left-2.5 rounded-bl-xl border-b-2 border-l-2`} />
      <span className={`${base} bottom-2.5 right-2.5 rounded-br-xl border-b-2 border-r-2`} />
    </>
  );
}

// Reconhecimento facial religado no desenho novo: o CPF diz quem é a pessoa e o
// rosto só CONFIRMA (um contra um). Não existe mais busca de rosto no meio de
// centenas de cadastros, que foi o que trocou nomes na assembleia de 08/08/2026.
// Voltar para false desliga a leitura e a presença passa a valer só pela foto.
const USAR_FACIAL = true;

const PERFIS = [
  { valor: "proprietario", texto: "Proprietário(a)" },
  { valor: "locatario", texto: "Locatário(a)" },
  { valor: "conjuge", texto: "Cônjuge" },
  { valor: "procurador", texto: "Procurador(a)" },
  { valor: "outro", texto: "Outro" },
];

function textoUnidade(bloco: string, apartamento: string) {
  return [bloco?.trim() && `Bloco ${bloco.trim()}`, apartamento?.trim() && `Apto ${apartamento.trim()}`]
    .filter(Boolean)
    .join(" · ");
}

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
    tem_sala?: boolean;
  } | null>(null);
  // Sala da assembleia: o servidor só entrega o endereço depois que a presença
  // é registrada — antes disso não existe botão nenhum para abrir.
  const [linkSala, setLinkSala] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [jaPresente, setJaPresente] = useState(false);
  const [jaPresenteNome, setJaPresenteNome] = useState("");
  const [avisoInadimplente, setAvisoInadimplente] = useState("");

  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("proprietario");
  const [selfie, setSelfie] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const marcaAparelho = useRef("");
  // Aviso que o servidor devolve quando o registro entra com selo de conferência.
  const [avisoConferencia, setAvisoConferencia] = useState("");

  // --- portão de CPF: morador digita o CPF e o sistema traz a unidade ---
  const [cpf, setCpf] = useState("");
  const [cpfConfirmado, setCpfConfirmado] = useState(false);
  const [consultandoCpf, setConsultandoCpf] = useState(false);
  const [unidadesCpf, setUnidadesCpf] = useState<
    { nome: string; bloco: string; apartamento: string; perfil: string }[] | null
  >(null);
  const [erroCpf, setErroCpf] = useState("");
  // O hash do CPF acompanha a presença até o fim: é ele que diz ao servidor
  // QUEM é a pessoa, para o rosto só precisar confirmar (um contra um).
  const [cpfHash, setCpfHash] = useState("");
  // Este CPF já tem rosto guardado? Muda o texto da etapa da câmera.
  const [temRostoCadastrado, setTemRostoCadastrado] = useState(false);
  // Texto do servidor para CPF que não está na planilha da administradora.
  const [mensagemCpf, setMensagemCpf] = useState("");
  // Etapa da tela: cpf -> confirmar (é você?) -> corrigir (dados na mão) -> form.
  const [etapa, setEtapa] = useState<
    "cpf" | "naoconsta" | "confirmar" | "corrigir" | "form"
  >("cpf");
  // Dados como vieram da planilha, para mostrar o que foi alterado.
  const [dadosPlanilha, setDadosPlanilha] = useState<{
    nome: string;
    bloco: string;
    apartamento: string;
  } | null>(null);
  // Por que o morador caiu na tela de correção — muda o aviso mostrado.
  const [motivoCorrecao, setMotivoCorrecao] = useState<
    "divergencia" | "sem_cpf" | "sem_cadastro"
  >("divergencia");

  // --- câmera / selfie ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [camErro, setCamErro] = useState("");

  // --- biometria facial (vetor do rosto, lido no próprio aparelho) ---
  // Guardamos as leituras SEPARADAS (não a média): a média aproxima rostos
  // diferentes. O servidor compara contra a leitura mais parecida.
  const [descritor, setDescritor] = useState<number[] | null>(null);
  const [leituras, setLeituras] = useState<number[][]>([]);
  const [lendoRosto, setLendoRosto] = useState(false);
  const [avisoFacial, setAvisoFacial] = useState("");

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
      .then((d) => {
        setLista(d);
        // Os modelos do reconhecimento facial pesam ~6 MB. Baixamos assim que a
        // lista abre (enquanto o morador digita nome e apartamento) para a
        // câmera não ficar esperando o download na hora da foto.
        if (USAR_FACIAL && d?.ativa)
          faceapiLib().then((m) => m.loadModels()).catch(() => {});
      })
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
      // O hash fica guardado: é ele que faz o rosto ser apenas CONFIRMADO
      // depois, em vez de procurado no meio de todos os moradores.
      setCpfHash(hash);
      setTemRostoCadastrado(!!res.tem_rosto);
      setUnidadesCpf(res.unidades);
      setMensagemCpf(res.mensagem || "");
      if (!res.unidades?.length) {
        // CPF fora da relação da administradora: explicamos o motivo antes de
        // pedir os dados na mão, para ninguém achar que é falha do sistema.
        setEtapa("naoconsta");
      } else if (res.unidades.length === 1) {
        prepararUnidade(res.unidades[0]);
        setEtapa("confirmar");
      }
    } catch {
      setErroCpf("Não consegui consultar agora. Tente de novo em instantes.");
    } finally {
      setConsultandoCpf(false);
    }
  }

  function prepararUnidade(u: {
    nome: string;
    bloco: string;
    apartamento: string;
    perfil?: string;
  }) {
    setNome(u.nome || "");
    setBloco(u.bloco || "");
    setApartamento(u.apartamento || "");
    setPerfil(u.perfil || "proprietario");
    setDadosPlanilha({
      nome: u.nome || "",
      bloco: u.bloco || "",
      apartamento: u.apartamento || "",
    });
  }

  function escolherUnidade(u: {
    nome: string;
    bloco: string;
    apartamento: string;
    perfil?: string;
  }) {
    prepararUnidade(u);
    setEtapa("confirmar");
  }

  // "Sim, sou eu": segue para a foto e a assinatura.
  function confirmarDados() {
    setCpfConfirmado(true);
    setEtapa("form");
  }

  // "Não sou eu / corrigir": o morador arruma nome, unidade e perfil na mão.
  function corrigirDados(motivo: "divergencia" | "sem_cpf" | "sem_cadastro") {
    setMotivoCorrecao(motivo);
    setEtapa("corrigir");
  }

  function pularCpf() {
    // Cadastro na hora: segue com os campos em branco para o morador digitar.
    setCpfHash("");
    setDadosPlanilha(null);
    corrigirDados("sem_cpf");
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

  // A foto sai sozinha quando o rosto fica bem enquadrado; o botão "Capturar
  // agora" continua na tela para quem quiser tirar na hora. Depois de um erro
  // a automação para, para não ficar repetindo a mesma tentativa.
  const dicaAuto = useAutoCaptura({
    video: videoRef,
    ativo: camAtiva && !lendoRosto && !selfie && !camErro,
    onCapturar: () => capturarSelfie(),
  });

  async function abrirCamera() {
    setCamErro("");
    setAvisoFacial("");
    setDescritor(null);
    setLeituras([]);
    // Os modelos do reconhecimento facial baixam enquanto a pessoa se ajeita
    // na frente da câmera, para o "Capturar" não ficar esperando.
    if (USAR_FACIAL)
      faceapiLib()
        .then((m) => m.loadModels())
        .catch(() => {});
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

  async function capturarSelfie() {
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
    const foto = canvas.toDataURL("image/jpeg", 0.7);

    // Biometria facial: a leitura do rosto acontece aqui no aparelho, com a
    // câmera ainda ligada (várias amostras). Sai só o vetor, nunca a imagem.
    // A foto só é mostrada no fim para o <video> não sumir durante a leitura.
    if (!USAR_FACIAL) {
      setDescritor(null);
      setLeituras([]);
      setAvisoFacial("");
      setSelfie(foto);
      pararCamera();
      return;
    }
    setLendoRosto(true);
    setAvisoFacial("");
    try {
      const { loadModels, lerRosto } = await faceapiLib();
      await loadModels();
      // Procura o rosto no vídeo ao vivo e também na foto que acabou de sair:
      // a foto está parada e nítida, então salva quando a imagem ao vivo treme.
      // Voltam VÁRIAS leituras, da melhor para a pior — nunca a média delas.
      const r = await lerRosto([video, canvas]);
      if (r) {
        const vetores = r.leituras.map((l) => Array.from(l.descriptor));
        setLeituras(vetores);
        setDescritor(vetores[0]);
        if (!r.boa)
          setAvisoFacial(
            "A foto ficou um pouco escura ou o rosto ficou pequeno na tela. A presença vale assim mesmo; se puder, tire outra mais perto e num lugar mais claro."
          );
      } else {
        setDescritor(null);
        setLeituras([]);
        setAvisoFacial(
          "Não consegui ler o seu rosto (luz ou ângulo). Sem problema: a sua foto vale como comprovante e a mesa confere. Se quiser, tire outra em um lugar mais claro, de frente para a câmera."
        );
      }
    } catch (e) {
      setDescritor(null);
      setLeituras([]);
      // Falha técnica (modelo não baixou, navegador sem suporte). O detalhe curto
      // separa isso de "estava escuro demais" na hora de socorrer o síndico.
      const detalhe = e instanceof Error && e.message ? ` (${e.message.slice(0, 90)})` : "";
      setAvisoFacial(
        `Não consegui ler o seu rosto agora${detalhe}. A presença vale pela foto assim mesmo.`
      );
    } finally {
      setLendoRosto(false);
      setSelfie(foto);
      pararCamera();
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
    if (lendoRosto) {
      setErro("Aguarde a leitura do rosto terminar.");
      return;
    }
    const assinatura = canvasRef.current?.toDataURL("image/png") || "";
    setEnviando(true);
    try {
      // Com CPF ou com rosto lido, a presença entra pelo caminho do servidor que
      // confere a identidade: o CPF diz quem é, o rosto confirma um-contra-um e
      // qualquer divergência entra assim mesmo, marcada para a mesa conferir.
      // Sem CPF e sem rosto, cai no registro simples (foto + assinatura).
      const r =
        cpfHash || descritor
          ? await api.registrarPresencaFacial(id, {
              ...(descritor ? { descriptor: descritor } : {}),
              ...(leituras.length ? { descriptors: leituras } : {}),
              ...(cpfHash ? { cpf_hash: cpfHash } : {}),
              nome: nome.trim(),
              bloco: bloco.trim(),
              apartamento: apartamento.trim(),
              perfil,
              selfie,
              assinatura,
              marca_aparelho: marcaAparelho.current,
              consentimento_lgpd: consentimento,
              declaracao_veracidade: consentimento,
            })
          : await api.registrarPresencaManual(id, {
              nome: nome.trim(),
              bloco: bloco.trim(),
              apartamento: apartamento.trim(),
              perfil,
              selfie,
              assinatura,
              metodo_auth: "selfie",
              marca_aparelho: marcaAparelho.current,
              consentimento_lgpd: consentimento,
              declaracao_veracidade: consentimento,
            });
      setAvisoConferencia(String((r as any)?.aviso_conferencia || ""));
      if ((r as any)?.ja_presente) {
        setJaPresente(true);
        setJaPresenteNome(String((r as any).nome || ""));
      }
      if ((r as any)?.inadimplente)
        setAvisoInadimplente((r as any).aviso || "");
      setLinkSala(String((r as any)?.link_reuniao || ""));
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
                (jaPresenteNome || nome).trim()
                  ? `, ${(jaPresenteNome || nome).trim()}`
                  : ""
              }.`
            : `Obrigado${nome.trim() ? `, ${nome.trim()}` : ""}.`}
        </p>
        {/* Rosto confundido com outra pessoa: o morador precisa saber para
            procurar a mesa em vez de simplesmente ficar fora da lista. */}
        {jaPresente &&
          !!jaPresenteNome &&
          !!nome.trim() &&
          jaPresenteNome.trim().toLowerCase() !== nome.trim().toLowerCase() && (
            <div className="mt-5 max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              A presença consta em nome de <b>{jaPresenteNome}</b>. Se não é
              você, procure a mesa da assembleia para registrar a sua presença.
            </div>
          )}
        {/* Selo laranja: a presença ESTÁ registrada; só passa pela vista da mesa
            antes de valer para o voto da unidade. */}
        {avisoConferencia && (
          <div className="mt-5 max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900">
            {avisoConferencia}
          </div>
        )}
        {avisoInadimplente && (
          <div className="mt-5 max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            {avisoInadimplente}
          </div>
        )}
        {/* Presença confirmada: só agora aparece a porta da sala. */}
        {linkSala && (
          <div className="mt-6 w-full max-w-sm">
            <a
              href={linkSala}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              <Video className="h-5 w-5 shrink-0" />
              Entrar na sala da Assembleia
            </a>
            <p className="mt-2 text-xs text-gray-500">
              Abre a sala de vídeo em outra aba. Se pedir permissão, autorize a
              câmera e o microfone.
            </p>
          </div>
        )}
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

  // Sala travada: o morador vê que ela existe, mas o botão só nasce depois da
  // presença registrada (o endereço nem chega ao navegador antes disso).
  const avisoSala = lista?.tem_sala ? (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5 text-xs text-primary-900">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        O botão para entrar na sala da Assembleia aparece aqui assim que você
        terminar de registrar a sua presença.
      </span>
    </div>
  ) : null;

  // Moldura comum das telas do começo (CPF → confirmação → correção).
  // É uma função, não um componente: componente declarado aqui dentro seria
  // recriado a cada tecla digitada e o campo perderia o foco.
  const moldura = (conteudo: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-1">Lista de presença</h1>
        {lista?.titulo && (
          <p className="text-sm text-gray-500 mb-4">{lista.titulo}</p>
        )}
        {avisoSala}
        {conteudo}
      </div>
    </div>
  );

  const nomePerfil =
    PERFIS.find((p) => p.valor === perfil)?.texto || "Proprietário(a)";

  // "É você, Fulano?" — o passo que faltava. Antes o sistema decidia sozinho
  // quem era a pessoa pelo rosto; agora ele mostra o que encontrou pelo CPF e
  // espera a pessoa confirmar. Se estiver errado, ela mesma corrige.
  if (lista && lista.ativa && !cpfConfirmado && etapa === "confirmar") {
    return moldura(
      <>
        <div className="card mb-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <UserCheck className="h-4 w-4 text-primary-600" />
            Confirme se é você
          </div>
          <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
            <p className="text-lg font-semibold leading-tight text-gray-900">
              {nome || "—"}
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {textoUnidade(bloco, apartamento) || "Unidade não informada"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{nomePerfil}</p>
          </div>
          <button onClick={confirmarDados} className="btn-primary mt-4 w-full">
            Sim, sou eu
          </button>
          <button
            onClick={() => corrigirDados("divergencia")}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" /> Não sou eu / corrigir meus dados
          </button>
        </div>
        <p className="px-1 text-xs text-gray-500">
          {temRostoCadastrado
            ? "Na próxima tela você tira uma foto. Ela serve só para confirmar que é você mesmo, comparando com a foto do seu próprio cadastro."
            : "Na próxima tela você tira uma foto. Como é a sua primeira vez, ela fica guardada como o seu cadastro para as próximas assembleias."}
        </p>
      </>
    );
  }

  // CPF que não está na relação da administradora. O morador entra do mesmo
  // jeito; o texto explica de onde vem a falha para ele não achar que é o
  // sistema que está errado.
  if (lista && lista.ativa && !cpfConfirmado && etapa === "naoconsta") {
    return moldura(
      <div className="card mb-4">
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {mensagemCpf ||
              "Seu CPF não consta na planilha de moradores. Verifique junto à administração do seu condomínio ou sua administradora, porque seu nome não consta na relação. Você pode registrar sua presença preenchendo os dados abaixo — a mesa confere depois."}
          </span>
        </div>
        <button
          onClick={() => corrigirDados("sem_cadastro")}
          className="btn-primary mt-4 w-full"
        >
          Preencher meus dados e continuar
        </button>
        <button
          onClick={() => {
            setUnidadesCpf(null);
            setMensagemCpf("");
            setEtapa("cpf");
          }}
          className="mt-3 w-full text-sm text-gray-500 underline underline-offset-2"
        >
          Digitar o CPF de novo
        </button>
      </div>
    );
  }

  // Correção manual: nome, unidade e perfil na mão. É a saída para quando a
  // planilha veio errada, quando o CPF não consta ou quando o morador não tem
  // o CPF em mãos. Nada disso barra a presença — ela entra marcada para a mesa.
  if (lista && lista.ativa && !cpfConfirmado && etapa === "corrigir") {
    const mudou =
      !!dadosPlanilha &&
      (dadosPlanilha.nome.trim() !== nome.trim() ||
        dadosPlanilha.bloco.trim() !== bloco.trim() ||
        dadosPlanilha.apartamento.trim() !== apartamento.trim());
    return moldura(
      <>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {motivoCorrecao === "sem_cadastro" ? (
              mensagemCpf ||
              "Seu CPF não consta na planilha de moradores. Verifique junto à administração do seu condomínio ou sua administradora, porque seu nome não consta na relação."
            ) : motivoCorrecao === "sem_cpf" ? (
              "Sem o CPF não conseguimos trazer os seus dados automaticamente. Preencha abaixo: a presença é registrada e a mesa confere na hora."
            ) : (
              <>
                <b>Atenção:</b> os dados que aparecem aqui vêm da planilha de
                moradores enviada pela administração do condomínio. Se estiver
                alguma coisa diferente, a divergência é dessa planilha — corrija
                abaixo e siga normalmente. A mesa da assembleia confere o que foi
                alterado.
              </>
            )}
          </span>
        </div>

        <div className="card mb-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              Nome completo
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field w-full"
              placeholder="Como está no seu documento"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Bloco</label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field w-full"
                placeholder="A"
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
                placeholder="305"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Você é o que na unidade?
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="input-field w-full"
            >
              {PERFIS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.texto}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mudou && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-xs text-gray-600">
            Na planilha consta <b>{dadosPlanilha!.nome || "sem nome"}</b> —{" "}
            {textoUnidade(dadosPlanilha!.bloco, dadosPlanilha!.apartamento) ||
              "sem unidade"}
            . Sua presença é registrada normalmente e fica sinalizada para a mesa
            conferir a unidade antes do voto.
          </div>
        )}

        <button
          onClick={confirmarDados}
          disabled={!nome.trim() || !apartamento.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          Continuar
        </button>
        {dadosPlanilha && (
          <button
            onClick={() => {
              setNome(dadosPlanilha.nome);
              setBloco(dadosPlanilha.bloco);
              setApartamento(dadosPlanilha.apartamento);
              setEtapa("confirmar");
            }}
            className="mt-3 w-full text-sm text-gray-500 underline underline-offset-2"
          >
            Voltar sem alterar
          </button>
        )}
      </>
    );
  }

  // Portão de CPF: primeiro passo. O morador digita o CPF e o sistema já traz
  // nome/bloco/apartamento; depois ele confirma que é ele.
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
          {avisoSala}

          <div className="card mb-4">
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <CreditCard className="w-4 h-4 text-primary-600" />
              Digite o seu CPF
            </label>
            <p className="mb-3 text-xs text-gray-500">
              É só digitar o CPF que o sistema encontra a sua unidade. Na tela
              seguinte você confere se os dados estão certos — se não estiverem,
              corrige na hora. Depois é a foto e a assinatura.
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

          </div>

          <button
            onClick={pularCpf}
            className="w-full text-sm text-gray-500 underline underline-offset-2"
          >
            Não tenho o CPF em mãos / cadastrar na hora
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
        {avisoSala}

        {/* Quem está registrando — fica à vista o tempo todo, e o botão volta
            para a correção se a pessoa perceber algo errado agora. */}
        {cpfConfirmado && nome.trim() && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {nome}
              </p>
              <p className="truncate text-xs text-gray-600">
                {textoUnidade(bloco, apartamento)}
              </p>
            </div>
            <button
              onClick={() => {
                setCpfConfirmado(false);
                corrigirDados(dadosPlanilha ? "divergencia" : "sem_cpf");
              }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-700 underline underline-offset-2"
            >
              <Pencil className="h-3.5 w-3.5" /> Corrigir
            </button>
          </div>
        )}

        {/* Reconhecimento facial */}
        <div className="card mb-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/30">
              <ScanFace className="h-8 w-8" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">
                {!USAR_FACIAL
                  ? "Foto de presença"
                  : temRostoCadastrado
                  ? "Confirmação pelo rosto"
                  : "Foto de presença"}
              </h2>
              <p className="text-xs text-gray-500">
                {!USAR_FACIAL
                  ? "Tire uma foto sua agora. Ela fica na lista de presença como comprovante de que você participou."
                  : temRostoCadastrado
                  ? "A leitura acontece no seu próprio aparelho e só compara com a foto do seu próprio cadastro. Se não bater, a sua foto de agora vale como comprovante e a mesa confere."
                  : "Tire uma foto sua agora. Ela fica na lista como comprovante e passa a ser o seu cadastro para as próximas assembleias."}
              </p>
            </div>
          </div>

          {selfie ? (
            <div className="text-center">
              <div
                className={`relative mx-auto aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-3xl border-2 shadow-sm ${
                  descritor || !USAR_FACIAL
                    ? "border-green-500"
                    : "border-amber-400"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfie}
                  alt="Selfie"
                  className="block h-full w-full object-cover"
                />
                <CantosFoco
                  cor={
                    descritor || !USAR_FACIAL
                      ? "border-green-300/90"
                      : "border-amber-300/90"
                  }
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
                  {descritor ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/95 px-3 py-1 text-xs font-semibold text-white shadow">
                      <Check className="h-3.5 w-3.5" /> Rosto lido
                    </span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white shadow ${
                        USAR_FACIAL ? "bg-amber-500/95" : "bg-green-500/95"
                      }`}
                    >
                      <Camera className="h-3.5 w-3.5" />{" "}
                      {USAR_FACIAL ? "Presença pela foto" : "Foto registrada"}
                    </span>
                  )}
                </div>
              </div>
              {descritor && (
                <p className="mt-2 text-xs text-gray-500">
                  Rosto lido neste aparelho. A imagem não sai daqui — só o código
                  de leitura.
                </p>
              )}
              <button
                onClick={() => {
                  setSelfie("");
                  setDescritor(null);
                  setLeituras([]);
                  abrirCamera();
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary-600"
              >
                <RefreshCw className="w-4 h-4" /> Tirar outra
              </button>
              {avisoFacial && (
                <p className="mt-2 text-left text-xs text-amber-700">
                  {avisoFacial}
                </p>
              )}
            </div>
          ) : camAtiva ? (
            <div className="text-center">
              <div className="relative mx-auto aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-3xl border-2 border-blue-500 bg-black shadow-sm">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="block h-full w-full object-cover"
                />
                {/* guia oval do rosto */}
                <div
                  className={`pointer-events-none absolute inset-x-8 inset-y-6 rounded-[50%] border-2 border-dashed transition-colors ${
                    dicaAuto === "pronto" || dicaAuto === "segure"
                      ? "border-green-400"
                      : "border-white/60"
                  }`}
                />
                <CantosFoco cor="border-blue-300/90" />
                {lendoRosto && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo o
                      rosto...
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={capturarSelfie}
                disabled={lendoRosto}
                className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2 disabled:opacity-60"
              >
                {lendoRosto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Lendo o rosto...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" /> Capturar agora
                  </>
                )}
              </button>
              <p className="mt-2 text-xs text-gray-500">
                {lendoRosto
                  ? "Fique parado, olhando para a câmera."
                  : textoDica(dicaAuto) ||
                    "Encaixe o rosto no oval. A foto sai sozinha."}
              </p>
              {camErro && <p className="mt-2 text-sm text-red-600">{camErro}</p>}
            </div>
          ) : (
            <div className="text-center">
              <div className="relative mx-auto flex aspect-[4/5] max-h-64 w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-blue-300 bg-white">
                <ScanFace className="h-28 w-28 text-blue-500" strokeWidth={1.1} />
                <CantosFoco cor="border-blue-400/80" />
              </div>
              <button
                onClick={abrirCamera}
                className="btn-primary mt-4 inline-flex w-full items-center justify-center gap-2"
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
            Concordo com o tratamento dos meus dados (selfie, assinatura, IP,
            aparelho e o código de leitura do meu rosto — dado biométrico, usado
            só para confirmar que cada pessoa registra presença uma única vez)
            para registrar a presença nesta assembleia, conforme a LGPD (Lei nº
            13.709/2018), e declaro que sou a própria pessoa e que as
            informações são verdadeiras.
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

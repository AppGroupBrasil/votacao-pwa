"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Vote, CheckCircle, XCircle, Shield, Copy, Check, FileDown, ExternalLink, Image, Link2, Users, Clock, ArrowLeft, MessageCircle, X, Lock } from "lucide-react";
import { api, getDeviceId } from "@/lib/api";
import WebAuthnVerify from "@/components/webauthn/WebAuthnVerify";
import FaceVerify from "@/components/FaceVerify";
import SelfieVerify from "@/components/SelfieVerify";
import OtpVerify from "@/components/OtpVerify";
import IdentificacaoEmail from "@/components/IdentificacaoEmail";
import IdentificacaoManual from "@/components/IdentificacaoManual";
import AcessoFacialVotacao from "@/components/AcessoFacialVotacao";
import ConsentimentoGate from "@/components/ConsentimentoGate";
import type { Assembleia, UnidadeVotante, CapturaIdentidade } from "@/lib/types";

export default function VotacaoPage() {
  const params = useParams();
  const assembleiaId = params.assembleia_id as string;

  // Link de um item só (/v/<codigo> da questão redireciona para cá com ?q=).
  // Quando vem preenchido, o morador vota apenas naquele item. Lido do window
  // porque o primeiro render (assembleia ainda carregando) não usa este valor.
  const [questaoLink] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("q") || ""
  );

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  // Entrada da votação sem login: rosto (padrão) → e-mail → votação manual.
  const [entryMode, setEntryMode] = useState<"facial" | "email" | "manual">(
    "facial"
  );
  const [manualId, setManualId] = useState("");
  const [votoPendente, setVotoPendente] = useState(false);
  // Aviso "1 voto por unidade" (2ª pessoa da mesma unidade). Não bloqueia — só informa.
  const [avisoUnidade, setAvisoUnidade] = useState("");
  const [authMethod, setAuthMethod] = useState<"facial" | "selfie" | "webauthn" | "otp">("facial");
  // Consentimento LGPD + assinatura + geo/marca capturados na tela inicial,
  // enviados junto da presença após a autenticação.
  const [captura, setCaptura] = useState<CapturaIdentidade | null>(null);
  // Questões cuja cota de votos já foi cumprida (por id). Rastrear por id em vez
  // de índice mantém a sequência correta mesmo que a administração encerre um
  // item ao vivo (o que reordena a lista filtrada).
  const [respondidas, setRespondidas] = useState<string[]>([]);
  // Itens em que esta pessoa JÁ votou antes de abrir esta página (por ela mesma,
  // pelo mesmo rosto ou pela mesma unidade). Cada link aceita um voto por
  // morador: reabrir o link de um item já votado não mostra a cédula de novo.
  const [jaVotadas, setJaVotadas] = useState<string[]>([]);
  // Itens já votados por OUTRA pessoa da mesma unidade (1 voto por unidade).
  const [unidadeVotou, setUnidadeVotou] = useState<string[]>([]);
  const [bloqueioJaVotou, setBloqueioJaVotou] = useState("");
  const [selectedOpcao, setSelectedOpcao] = useState<string | null>(null);
  const [comprovantes, setComprovantes] = useState<
    { questao: string; hash: string }[]
  >([]);
  const [votando, setVotando] = useState(false);
  // Reenvio automático em conexão oscilante (4G): mostra "Reenviando..." e,
  // se esgotar as tentativas, libera reenvio manual seguro (backend idempotente).
  const [reenviando, setReenviando] = useState(false);
  const [falhaRede, setFalhaRede] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");
  const [inadModal, setInadModal] = useState<
    { msg: string; whatsapp: string } | null
  >(null);
  // Selo laranja: entrou na assembleia, mas o voto da unidade espera a mesa.
  const [mesaModal, setMesaModal] = useState("");

  // Voto por procuração / mais de uma unidade
  const [ehProcuracao, setEhProcuracao] = useState(false);
  const [unidadeProc, setUnidadeProc] = useState<UnidadeVotante | null>(null);
  const [unidades, setUnidades] = useState<UnidadeVotante[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [procConcluida, setProcConcluida] = useState(false);
  const [procFeitas, setProcFeitas] = useState<string[]>([]);

  // Modo "morador declara": o próprio morador informa outra unidade que possui,
  // depois do seu voto. Cada unidade declarada vota separadamente e fica
  // pendente até a administração validar.
  const [ehDeclaracao, setEhDeclaracao] = useState(false);
  const [declOpen, setDeclOpen] = useState(false);
  const [temOutra, setTemOutra] = useState(false);
  const [declForm, setDeclForm] = useState({ bloco: "", apartamento: "", nome: "" });
  const [declUnidade, setDeclUnidade] = useState<{
    bloco: string;
    apartamento: string;
    nome: string;
  } | null>(null);
  const [grupoDecl, setGrupoDecl] = useState("");
  const [declConcluida, setDeclConcluida] = useState(false);

  function abrirProcuracao() {
    setPickerOpen(true);
    if (unidades.length === 0) {
      api.getUnidades(assembleiaId).then(setUnidades).catch(() => {});
    }
  }

  function abrirDeclaracao() {
    setDeclOpen(true);
    setTemOutra(false);
    setDeclForm({ bloco: "", apartamento: "", nome: "" });
  }

  function iniciarVotoDeclaracao(e: React.FormEvent) {
    e.preventDefault();
    if (!declForm.apartamento.trim() || !declForm.nome.trim()) return;
    setDeclUnidade({ ...declForm });
    setGrupoDecl(crypto.randomUUID());
    setEhDeclaracao(true);
    setDeclOpen(false);
    setDeclConcluida(false);
    setDone(false);
    setRespondidas([]);
    setSelectedOpcao(null);
    setVotosNestaQuestao(0);
  }

  function iniciarVotoProcuracao(u: UnidadeVotante) {
    setUnidadeProc(u);
    setEhProcuracao(true);
    setPickerOpen(false);
    setProcConcluida(false);
    setDone(false);
    setRespondidas([]);
    setSelectedOpcao(null);
    setVotosNestaQuestao(0);
  }

  // eleitor_id pode vir do link de convite (?eleitor=) ou do cadastro feito
  // neste dispositivo (localStorage). No link sem login não há nenhum dos
  // dois — o morador se identifica pelo e-mail (OTP) na tela inicial.
  const [eleitorId, setEleitorId] = useState("");
  const [votosPermitidos, setVotosPermitidos] = useState(1);
  const [votosNestaQuestao, setVotosNestaQuestao] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("eleitor");
    const fromStorage = localStorage.getItem("eleitor_id");
    if (fromUrl) setEleitorId(fromUrl);
    else if (fromStorage) setEleitorId(fromStorage);
  }, []);

  useEffect(() => {
    let ativo = true;
    function carregar(redirecionar: boolean) {
      api.getAssembleiaPublic(assembleiaId)
        .then((a) => { if (ativo) setAssembleia(a); })
        .catch(() => {
          // Assembleia inexistente: leva o morador ao fluxo de entrada.
          if (redirecionar) window.location.replace("/acesso");
        });
    }
    carregar(true);
    // Reconsulta enquanto a votação não foi liberada, para a tela de espera
    // abrir sozinha assim que a administração liberar.
    const t = setInterval(() => carregar(false), 6000);
    return () => { ativo = false; clearInterval(t); };
  }, [assembleiaId]);

  // Um voto por item: assim que o morador se identifica, o servidor informa em
  // quais itens ele já votou, para a tela avisar antes de mostrar a cédula.
  useEffect(() => {
    if (!authToken) return;
    let ativo = true;
    api.getQuestoesVotadas(assembleiaId, authToken)
      .then((r) => {
        if (!ativo) return;
        setJaVotadas(r.questoes || []);
        setUnidadeVotou(r.por_unidade || []);
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, [assembleiaId, authToken]);

  // Lista de presença: registra a presença somente após autenticação
  // (webauthn/desbloqueio, facial ou token por e-mail/OTP).
  useEffect(() => {
    if (authToken && !manualId) {
      api.registrarPresenca(assembleiaId, authToken, captura || undefined).catch(() => {});
    }
  }, [assembleiaId, authToken, manualId, captura]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card text-center">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!assembleia) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Carregando votação...</p>
      </div>
    );
  }

  // Link sem login: ninguém identificado ainda → rosto (padrão), com e-mail e
  // votação manual como alternativas para quem não entra pela facial.
  if (!authToken && !eleitorId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Vote className="w-7 h-7 text-primary-600" />
            <span className="font-bold text-lg">Votação</span>
          </div>
          {entryMode === "facial" && (
            <AcessoFacialVotacao
              assembleiaId={assembleiaId}
              temCpf={!!assembleia.tem_cpf}
              onSuccess={(token, id, aviso) => {
                setManualId(id);
                setVotosPermitidos(1);
                setAvisoUnidade(aviso || "");
                setAuthToken(token);
              }}
              onEmail={() => setEntryMode("email")}
              onManual={() => setEntryMode("manual")}
            />
          )}
          {entryMode === "manual" && (
            <IdentificacaoManual
              assembleiaId={assembleiaId}
              onSuccess={(token, id, aviso) => {
                setManualId(id);
                setVotosPermitidos(1);
                setAvisoUnidade(aviso || "");
                setAuthToken(token);
              }}
              onBack={() => setEntryMode("facial")}
            />
          )}
          {entryMode === "email" && (
            <>
              <IdentificacaoEmail
                assembleiaId={assembleiaId}
                exigirConfirmacao={assembleia.exigir_confirmacao_email !== false}
                onSuccess={(token, id, votos) => {
                  setEleitorId(id);
                  setVotosPermitidos(Math.max(1, votos || 1));
                  setAuthToken(token);
                }}
                onManual={() => setEntryMode("manual")}
              />
              <button
                onClick={() => setEntryMode("facial")}
                className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Voltar para o reconhecimento facial
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Tela inicial: consentimento LGPD + assinatura antes de autenticar.
  if (!authToken && eleitorId && !captura) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Vote className="w-7 h-7 text-primary-600" />
            <span className="font-bold text-lg">Votação</span>
          </div>
          <ConsentimentoGate onConcluir={setCaptura} />
        </div>
      </div>
    );
  }

  // Escada de identidade: facial → selfie → WebAuthn → OTP (cada um recua para
  // o próximo se o morador recusar ou não puder usar).
  if (!authToken && eleitorId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Vote className="w-7 h-7 text-primary-600" />
            <span className="font-bold text-lg">Votação</span>
          </div>

          {authMethod === "facial" && (
            <FaceVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token, votos) => { setVotosPermitidos(Math.max(1, votos || 1)); setAuthToken(token); }}
              onFallback={() => setAuthMethod("selfie")}
            />
          )}

          {authMethod === "selfie" && (
            <SelfieVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token, votos) => { setVotosPermitidos(Math.max(1, votos || 1)); setAuthToken(token); }}
              onFallback={() => setAuthMethod("webauthn")}
            />
          )}

          {authMethod === "webauthn" && (
            <WebAuthnVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token, votos) => { setVotosPermitidos(Math.max(1, votos || 1)); setAuthToken(token); }}
              onFallback={() => setAuthMethod("otp")}
            />
          )}

          {authMethod === "otp" && (
            <OtpVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token, votos) => { setVotosPermitidos(Math.max(1, votos || 1)); setAuthToken(token); }}
            />
          )}
        </div>
      </div>
    );
  }

  // Questões encerradas pela administração não entram na sequência de votação.
  const questoesAbertas = (assembleia.questoes || []).filter((q) => !q.encerrada);
  // Item do link (?q=): a votação fica restrita a ele; sem link de item, o
  // morador segue a sequência normal de todos os itens.
  const itemDoLink = questaoLink
    ? (assembleia.questoes || []).find((q) => q.id === questaoLink) || null
    : null;
  const questoes = questaoLink
    ? questoesAbertas.filter((q) => q.id === questaoLink)
    : questoesAbertas;
  // Voto próprio (não é procuração nem unidade declarada): só nele vale a trava
  // "um voto por item" da própria pessoa/unidade.
  const votoProprio = !ehProcuracao && !ehDeclaracao;
  // Itens ainda não votados por este eleitor (inclui os bloqueados, que
  // permanecem pendentes até a administração liberar). Itens já votados em
  // acesso anterior também saem da fila — cada item aceita um voto por morador.
  const pendentes = questoes.filter(
    (q) =>
      !respondidas.includes(q.id) &&
      !(votoProprio && (jaVotadas.includes(q.id) || unidadeVotou.includes(q.id)))
  );
  // Não sobrou item para votar e esta pessoa não votou nada agora: ou ela já
  // tinha votado (outro acesso/dispositivo/rosto) ou a unidade dela votou
  // primeiro. Sem isto a tela diria "voto registrado" a quem não votou.
  const semItens =
    votoProprio &&
    !done &&
    comprovantes.length === 0 &&
    questoes.length > 0 &&
    pendentes.length === 0;
  const motivoBloqueio = semItens
    ? questoes.some((q) => jaVotadas.includes(q.id))
      ? "propria"
      : questoes.some((q) => unidadeVotou.includes(q.id))
        ? "unidade"
        : ""
    : "";
  // Bloqueados ("aguarde o debate"): visíveis, mas não votáveis até liberar.
  const bloqueadasPendentes = pendentes.filter((q) => q.liberada === false);
  // A questão atual é a primeira pendente que já esteja liberada para votação.
  const questao = pendentes.find((q) => q.liberada !== false);
  const indiceAtual = questoes.length - pendentes.length;
  // Em voto por procuração cada unidade tem direito a 1 voto; a cota de
  // múltiplas unidades (votos_permitidos) vale só para o voto próprio.
  const cotaQuestao = ehProcuracao || ehDeclaracao ? 1 : votosPermitidos;

  // Link da sala de vídeo — só é mostrado aqui, depois da presença registrada
  // (chegamos a este ponto do render apenas com o morador já identificado).
  const salaBanner = assembleia.link_reuniao ? (
    <a
      href={assembleia.link_reuniao}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full mb-4 rounded-lg bg-primary-600 text-white px-4 py-3 font-medium hover:bg-primary-700 transition-colors"
    >
      <ExternalLink className="w-4 h-4" /> Entrar na reunião (vídeo)
    </a>
  ) : null;

  // Seletor de unidade para voto por procuração
  if (pickerOpen) {
    const disponiveis = unidades.filter(
      (u) => u.id !== eleitorId && !procFeitas.includes(u.id)
    );
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-6 h-6 text-primary-600" />
            <h1 className="text-lg font-bold">Voto por procuração</h1>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Selecione a unidade que você representa. O voto ficará pendente até
            o síndico validar a procuração.
          </p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {disponiveis.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                Nenhuma unidade disponível.
              </p>
            ) : (
              disponiveis.map((u) => (
                <button
                  key={u.id}
                  onClick={() => iniciarVotoProcuracao(u)}
                  className="w-full text-left px-4 py-3 rounded-lg border-2 border-gray-200 hover:border-primary-400 transition-colors"
                >
                  <span className="font-medium">{u.nome}</span>
                  <span className="block text-xs text-gray-500">
                    {u.bloco ? `${u.bloco} / ` : ""}
                    {u.apartamento}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => setPickerOpen(false)}
            className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    );
  }

  // Conclusão de um voto por procuração (pendente de validação)
  if (procConcluida) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Voto por procuração enviado</h1>
          <p className="text-gray-600 mb-1">
            Unidade {unidadeProc?.bloco ? `${unidadeProc.bloco} / ` : ""}
            {unidadeProc?.apartamento}
          </p>
          <p className="text-gray-600 mb-6">
            Aguardando validação do síndico/administrador. O voto só será
            contabilizado após a aprovação.
          </p>
          <button
            onClick={abrirProcuracao}
            className="btn-primary w-full mb-2 flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" /> Votar por outra unidade
          </button>
          <button
            onClick={() => {
              setProcConcluida(false);
              setEhProcuracao(false);
              setUnidadeProc(null);
              setDone(true);
            }}
            className="btn-secondary w-full"
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  // Formulário: morador declara outra unidade (modo "morador")
  if (declOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-6 h-6 text-primary-600" />
            <h1 className="text-lg font-bold">Você tem mais de uma unidade?</h1>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Informe os dados da outra unidade que você possui. O voto ficará
            pendente até a administração validar.
          </p>
          <label className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              checked={temOutra}
              onChange={(e) => setTemOutra(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">
              Sim, tenho outra unidade para declarar
            </span>
          </label>
          {temOutra && (
            <form onSubmit={iniciarVotoDeclaracao} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bloco
                </label>
                <input
                  type="text"
                  value={declForm.bloco}
                  onChange={(e) =>
                    setDeclForm({ ...declForm, bloco: e.target.value })
                  }
                  className="input-field"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apartamento / unidade
                </label>
                <input
                  type="text"
                  value={declForm.apartamento}
                  onChange={(e) =>
                    setDeclForm({ ...declForm, apartamento: e.target.value })
                  }
                  className="input-field"
                  maxLength={20}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do proprietário
                </label>
                <input
                  type="text"
                  value={declForm.nome}
                  onChange={(e) =>
                    setDeclForm({ ...declForm, nome: e.target.value })
                  }
                  className="input-field"
                  maxLength={200}
                  required
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                Votar por esta unidade
              </button>
            </form>
          )}
          <button
            onClick={() => setDeclOpen(false)}
            className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
        </div>
      </div>
    );
  }

  // Conclusão de uma unidade declarada (pendente de validação)
  if (declConcluida) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Unidade declarada enviada</h1>
          <p className="text-gray-600 mb-1">
            Unidade {declUnidade?.bloco ? `${declUnidade.bloco} / ` : ""}
            {declUnidade?.apartamento} — {declUnidade?.nome}
          </p>
          <p className="text-gray-600 mb-6">
            Aguardando validação da administração. O voto só será contabilizado
            após a aprovação.
          </p>
          <button
            onClick={abrirDeclaracao}
            className="btn-primary w-full mb-2 flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" /> Declarar outra unidade
          </button>
          <button
            onClick={() => {
              setDeclConcluida(false);
              setEhDeclaracao(false);
              setDeclUnidade(null);
              setDone(true);
            }}
            className="btn-secondary w-full"
          >
            Concluir
          </button>
        </div>
      </div>
    );
  }

  if (!done && assembleia.votacao_liberada === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Clock className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Aguardando liberação</h1>
          <p className="text-gray-600 mb-4">
            Sua presença está registrada. A votação será liberada pela administração em instantes — esta tela abre automaticamente.
          </p>
          {salaBanner}
        </div>
      </div>
    );
  }

  // Link de um item só: o item pode ter sido excluído ou já encerrado — nesses
  // casos explicamos, em vez de jogar o morador na sequência da assembleia.
  if (!done && questaoLink && !itemDoLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Shield className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Item não encontrado</h1>
          <p className="text-gray-600 mb-4">
            Este item de votação não existe mais. Peça o link atualizado à
            administração.
          </p>
          <a href={`/votacao/${assembleiaId}`} className="btn-primary inline-block">
            Ver a votação completa
          </a>
        </div>
      </div>
    );
  }

  // Um voto por morador em cada link: quem já votou neste item (agora, em outro
  // dispositivo, pelo mesmo rosto ou pela mesma unidade) é bloqueado com aviso
  // claro, em vez de ver a cédula de novo e tomar erro depois de escolher.
  if (!done && (bloqueioJaVotou || motivoBloqueio)) {
    // O servidor pode barrar por unidade e mandar a explicação pronta; nesse
    // caso o título tem de falar de unidade, não de perfil.
    const porUnidade =
      motivoBloqueio === "unidade" ||
      (!!bloqueioJaVotou && /unidade/i.test(bloqueioJaVotou));
    // Sem link de item o bloqueio vale para a votação toda.
    const alvo = itemDoLink?.titulo
      ? `em "${itemDoLink.titulo}"`
      : questoes.length > 1
        ? "nos itens desta votação"
        : "neste item";
    const sufixo = itemDoLink || questoes.length === 1 ? " neste item" : "";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          {/* X vermelho, nunca o certo verde: o verde é a tela de voto
              confirmado e usar o mesmo símbolo aqui faz o morador achar que
              acabou de votar de novo. */}
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-700 mb-2">
            {porUnidade
              ? "Já existe um voto para esta unidade"
              : "Já existe um voto para o seu perfil"}
          </h1>
          <p className="text-gray-600 mb-4">
            {bloqueioJaVotou ||
              (porUnidade
                ? `Outra pessoa da sua unidade já votou ${alvo}. Vale um voto por unidade — o primeiro voto é o que conta.`
                : `Já existe um voto registrado para o seu perfil ${alvo}. Cada morador vota uma única vez em cada item.`)}
          </p>
          {questaoLink && (
            <a
              href={`/votacao/${assembleiaId}`}
              className="btn-primary inline-block mb-3"
            >
              Ver os outros itens
            </a>
          )}
          {salaBanner}
        </div>
      </div>
    );
  }

  if (!done && itemDoLink?.encerrada) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Votação encerrada</h1>
          <p className="text-gray-600 mb-4">
            A votação de <strong>{itemDoLink.titulo}</strong> foi encerrada pela
            administração e não aceita mais votos.
          </p>
          {salaBanner}
        </div>
      </div>
    );
  }

  if (!done && questoes.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Shield className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Aguardando questões</h1>
          <p className="text-gray-600">
            Nenhuma questão foi liberada para votação ainda. Aguarde o início da votação.
          </p>
        </div>
      </div>
    );
  }

  if (done || (questoes.length > 0 && pendentes.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Voto Registrado!</h1>
          <p className="text-gray-600 mb-6">
            Seus votos foram registrados com sucesso.
          </p>

          {votoPendente && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-4 text-left">
              Sua unidade já possuía voto registrado, por isso seu voto ficou
              aguardando a validação do síndico. Ele será contabilizado após a
              conferência.
            </div>
          )}

          <div className="text-left space-y-3">
            <h3 className="font-medium text-sm text-gray-700 flex items-center gap-1">
              <Shield className="w-4 h-4" /> Comprovantes de Verificação
            </h3>
            {comprovantes.map((c) => (
              <div
                key={c.hash}
                className="bg-gray-50 rounded-lg p-3 text-xs break-all"
              >
                <p className="font-medium text-gray-700 mb-1">{c.questao}</p>
                <code className="text-gray-500">{c.hash}</code>
                <a
                  href={`/votacao/comprovante?hash=${c.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 text-primary-600 underline"
                >
                  Verificar este comprovante
                </a>
              </div>
            ))}
            <p className="text-xs text-gray-500">
              Guarde este código: a qualquer momento você pode confirmar seu
              voto em{" "}
              <a
                href="/votacao/comprovante"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 underline"
              >
                appvotacao.com.br/votacao/comprovante
              </a>
            </p>
          </div>

          <button
            onClick={() => {
              const text = comprovantes
                .map(
                  (c) =>
                    `${c.questao}: ${c.hash}\nVerificar: ${window.location.origin}/votacao/comprovante?hash=${c.hash}`
                )
                .join("\n\n");
              navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" /> Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Copiar Comprovantes
              </>
            )}
          </button>

          {manualId ? null : assembleia.modo_multiplas_unidades === "morador" ? (
            <div className="mt-6 pt-4 border-t text-left">
              <p className="text-xs text-gray-500 mb-2">
                Você tem mais de uma unidade?
              </p>
              <button
                onClick={abrirDeclaracao}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" /> Declarar outra unidade
              </button>
            </div>
          ) : (
            <div className="mt-6 pt-4 border-t text-left">
              <p className="text-xs text-gray-500 mb-2">
                Possui procuração ou mais de uma unidade?
              </p>
              <button
                onClick={abrirProcuracao}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Users className="w-4 h-4" /> Voto por procuração / outra unidade
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Nenhum item liberado no momento, mas ainda há itens pendentes (bloqueados
  // pela administração). Aguarda a liberação do próximo item — a tela se
  // atualiza sozinha a cada 6s. NÃO mostra a tela final para o eleitor não
  // pensar que a votação acabou e fechar a página.
  if (!done && !questao && bloqueadasPendentes.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <Clock className="w-16 h-16 text-primary-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">
            {questaoLink ? "Aguarde a liberação" : "Aguarde o próximo item"}
          </h1>
          <p className="text-gray-600 mb-4">
            {questaoLink
              ? "Este item será liberado para votação assim que o assunto for debatido."
              : "O próximo item será liberado para votação assim que o assunto for debatido."}{" "}
            Mantenha esta página aberta — ela abrirá automaticamente quando a
            votação for liberada.
          </p>
          {salaBanner}
        </div>
      </div>
    );
  }

  async function handleVotar() {
    if (!selectedOpcao || !questao || !authToken) return;
    setVotando(true);
    // Reenvio (automático ou manual após queda de rede): o voto pode já estar no
    // servidor, então "já registrado" ali é sucesso, não segunda tentativa.
    let houveReenvio = falhaRede;
    setFalhaRede(false);

    const payload = {
      ...(manualId
        ? {}
        : {
            eleitor_id:
              ehProcuracao && unidadeProc ? unidadeProc.id : eleitorId,
          }),
      questao_id: questao.id,
      opcao_id: selectedOpcao,
      auth_token: authToken,
      device_id: getDeviceId(),
      por_procuracao: manualId ? false : ehProcuracao,
      unidade_declarada: manualId ? false : ehDeclaracao,
      ...(ehDeclaracao && declUnidade && !manualId
        ? {
            decl_bloco: declUnidade.bloco,
            decl_apartamento: declUnidade.apartamento,
            decl_nome: declUnidade.nome,
            grupo_declaracao: grupoDecl,
          }
        : {}),
    };

    // Reenvio automático quando a REDE cai (sem resposta do servidor: 4G que
    // oscila, timeout, offline). O backend é idempotente — um retry devolve o
    // mesmo voto (ja_registrado), nunca duplica — então tentar de novo é seguro.
    // Erro de aplicação (o servidor respondeu 4xx) NÃO é reenviado: cai no catch.
    async function votarComReenvio() {
      const maxTentativas = 4;
      for (let tentativa = 1; ; tentativa++) {
        try {
          return await api.votar(assembleiaId, payload);
        } catch (err: any) {
          const semResposta = !err?.response; // fetch rejeitou (rede), sem HTTP
          if (semResposta && tentativa < maxTentativas) {
            houveReenvio = true;
            setReenviando(true);
            await new Promise((r) => setTimeout(r, 1200 * tentativa));
            continue;
          }
          if (semResposta) {
            const e: any = new Error("network-exhausted");
            e.redeEsgotada = true;
            throw e;
          }
          throw err;
        }
      }
    }

    try {
      const result = await votarComReenvio();
      setReenviando(false);

      // Voto já existia no servidor sem ter sido reenvio: é uma segunda
      // tentativa no mesmo item (link reaberto). Mostra o bloqueio em vez de
      // "voto registrado" — o voto original é o que vale.
      if ((result as any)?.ja_registrado && !houveReenvio && votoProprio) {
        setJaVotadas((prev) =>
          prev.includes(questao.id) ? prev : [...prev, questao.id]
        );
        setBloqueioJaVotou(
          "Já existe um voto registrado para o seu perfil neste item. O primeiro voto é o que vale."
        );
        setSelectedOpcao(null);
        return;
      }

      if (manualId && result.status === "pendente") setVotoPendente(true);

      if (!ehProcuracao && !ehDeclaracao) {
        setComprovantes((prev) => [
          ...prev,
          { questao: questao.titulo, hash: result.hash_voto },
        ]);
      }
      setSelectedOpcao(null);

      // Múltiplos votos na mesma questão (mais de uma unidade): permanece na
      // questão até consumir a cota, podendo escolher opções diferentes.
      const votosFeitos = votosNestaQuestao + 1;
      if (votosFeitos < cotaQuestao) {
        setVotosNestaQuestao(votosFeitos);
        return;
      }
      setVotosNestaQuestao(0);
      setRespondidas((prev) => [...prev, questao.id]);

      // Só conclui de fato quando não sobra NENHUM item pendente (nem votável
      // nem bloqueado). Se restarem itens bloqueados, cai na tela "Aguarde o
      // próximo item" em vez da tela final.
      const restantes = pendentes.filter((q) => q.id !== questao.id);
      const ultima = restantes.length === 0;
      if (ultima) {
        if (ehProcuracao) {
          if (unidadeProc) setProcFeitas((p) => [...p, unidadeProc.id]);
          setProcConcluida(true);
        } else if (ehDeclaracao) {
          setDeclConcluida(true);
        } else {
          setDone(true);
        }
      }
    } catch (err: any) {
      if (err?.redeEsgotada) {
        // Não perdeu o voto necessariamente — só não deu para confirmar.
        // Mantém a opção selecionada para reenvio manual seguro (idempotente).
        setFalhaRede(true);
      } else {
        const data = err?.response?.data;
        if (data?.code === "ja_votou") {
          // Já há voto desta pessoa/unidade neste item: bloqueio explicado.
          setJaVotadas((prev) =>
            prev.includes(questao!.id) ? prev : [...prev, questao!.id]
          );
          setBloqueioJaVotou(data.error || "Você já votou neste item.");
          setSelectedOpcao(null);
        } else if (data?.code === "inadimplente") {
          setInadModal({
            msg: data.error || "Entre em contato com sua administradora.",
            whatsapp: (data.whatsapp || "").replace(/\D/g, ""),
          });
        } else if (data?.code === "conferir_na_mesa") {
          // Selo laranja: um alert() do navegador fazia isto parecer erro do
          // sistema. É uma instrução — procurar a mesa com o documento.
          setMesaModal(
            data.error ||
              "Seu voto está aguardando a conferência da mesa. Procure a mesa com um documento."
          );
          setSelectedOpcao(null);
        } else {
          alert(data?.error || "Erro ao registrar voto.");
        }
      }
    } finally {
      setReenviando(false);
      setVotando(false);
    }
  }

  // Neste ponto os casos sem questão votável (concluído / aguardando / bloqueado)
  // já retornaram acima; a guarda satisfaz o TypeScript e é defensiva.
  if (!questao) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4">
      {inadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setInadModal(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                Unidade inadimplente
              </h2>
              <p className="text-sm text-gray-600 mb-5">{inadModal.msg}</p>
              {inadModal.whatsapp ? (
                <a
                  href={`https://wa.me/${inadModal.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-3"
                >
                  <MessageCircle className="w-5 h-5" />
                  Falar com a administradora
                </a>
              ) : (
                <p className="text-xs text-gray-400">
                  Contato da administradora não configurado.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {mesaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative">
            <button
              onClick={() => setMesaModal("")}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                Procure a mesa para liberar seu voto
              </h2>
              <p className="text-sm text-gray-600 mb-5">{mesaModal}</p>
              <button
                onClick={() => setMesaModal("")}
                className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-3"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card w-full max-w-md">
        {salaBanner}
        {ehProcuracao && unidadeProc && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0" />
            Voto por procuração — {unidadeProc.bloco ? `${unidadeProc.bloco} / ` : ""}
            {unidadeProc.apartamento} (pendente de validação)
          </div>
        )}
        {ehDeclaracao && declUnidade && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
            <Users className="w-4 h-4 shrink-0" />
            Unidade declarada — {declUnidade.bloco ? `${declUnidade.bloco} / ` : ""}
            {declUnidade.apartamento} (pendente de validação)
          </div>
        )}
        <div className="flex items-center gap-2 mb-6">
          <Vote className="w-6 h-6 text-primary-600" />
          <span className="text-sm text-gray-500">
            Questão {indiceAtual + 1} de {questoes.length}
          </span>
        </div>

        {avisoUnidade && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{avisoUnidade}</span>
            <button
              onClick={() => setAvisoUnidade("")}
              className="text-amber-500 hover:text-amber-700 shrink-0"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {cotaQuestao > 1 && (
          <div className="mb-4 rounded-lg bg-primary-50 border border-primary-200 px-3 py-2 text-sm text-primary-800">
            Você tem direito a {cotaQuestao} votos nesta questão (mais de uma
            unidade). Voto {votosNestaQuestao + 1} de {cotaQuestao} — pode
            escolher opções diferentes a cada voto.
          </div>
        )}

        <h2 className="text-xl font-bold mb-4">{questao.titulo}</h2>

        {questao.descricao && (
          <p className="text-gray-600 text-sm mb-4">{questao.descricao}</p>
        )}

        <div className="space-y-2 mb-6">
          {questao.opcoes.map((opcao) => (
            <div key={opcao.id}>
              <button
                onClick={() => setSelectedOpcao(opcao.id)}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${
                  selectedOpcao === opcao.id
                    ? "border-primary-500 bg-primary-50 text-primary-900"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {opcao.imagem_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={opcao.imagem_url}
                    alt={opcao.texto}
                    className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0"
                  />
                )}
                <span className="flex-1">{opcao.texto}</span>
              </button>
              {(opcao.arquivo_url || opcao.link_externo) && (
                <div className="flex gap-3 ml-4 mt-1 mb-1">
                  {opcao.arquivo_url && (
                    <a href={opcao.arquivo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <FileDown className="w-3 h-3" /> Baixar documento
                    </a>
                  )}
                  {opcao.link_externo && (
                    <a href={opcao.link_externo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink className="w-3 h-3" /> Ver mais
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {falhaRede && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Sua conexão oscilou.</p>
            <p>
              Não conseguimos confirmar seu voto. Toque em{" "}
              <strong>Confirmar Voto</strong> de novo — se ele já tiver sido
              registrado, o sistema reconhece e não conta duas vezes.
            </p>
          </div>
        )}

        <button
          onClick={handleVotar}
          disabled={!selectedOpcao || votando}
          className="btn-primary w-full"
        >
          {votando
            ? reenviando
              ? "Reenviando..."
              : "Registrando..."
            : falhaRede
            ? "Tentar reenviar"
            : "Confirmar Voto"}
        </button>

        {/* Progress bar */}
        <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all duration-300"
            style={{
              width: `${((indiceAtual + 1) / questoes.length) * 100}%`,
            }}
          />
        </div>

        {bloqueadasPendentes.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 mb-2">
              Próximos itens
            </p>
            <div className="space-y-2">
              {bloqueadasPendentes.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-gray-400"
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-sm">{q.titulo}</span>
                  <span className="text-[11px] font-medium whitespace-nowrap">
                    Aguarde o debate
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating copy link button */}
      <button
        onClick={() => {
          const url = window.location.href;
          navigator.clipboard.writeText(url);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2000);
        }}
        className="fixed bottom-6 right-6 flex items-center gap-2 bg-white shadow-lg border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-full text-sm font-medium transition-all z-50"
        title="Copiar link da votação"
      >
        {linkCopied ? (
          <>
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-green-600">Copiado!</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Link da Votação</span>
          </>
        )}
      </button>
    </div>
  );
}

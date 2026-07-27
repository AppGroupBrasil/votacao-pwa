"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Vote, CheckCircle, Shield, Copy, Check, FileDown, ExternalLink, Image, Link2, Users, Clock, ArrowLeft, MessageCircle, X, Lock } from "lucide-react";
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

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  // Entrada da votação sem login: rosto (padrão) → e-mail → votação manual.
  const [entryMode, setEntryMode] = useState<"facial" | "email" | "manual">(
    "facial"
  );
  const [manualId, setManualId] = useState("");
  const [votoPendente, setVotoPendente] = useState(false);
  const [authMethod, setAuthMethod] = useState<"facial" | "selfie" | "webauthn" | "otp">("facial");
  // Consentimento LGPD + assinatura + geo/marca capturados na tela inicial,
  // enviados junto da presença após a autenticação.
  const [captura, setCaptura] = useState<CapturaIdentidade | null>(null);
  // Questões cuja cota de votos já foi cumprida (por id). Rastrear por id em vez
  // de índice mantém a sequência correta mesmo que a administração encerre um
  // item ao vivo (o que reordena a lista filtrada).
  const [respondidas, setRespondidas] = useState<string[]>([]);
  const [selectedOpcao, setSelectedOpcao] = useState<string | null>(null);
  const [comprovantes, setComprovantes] = useState<
    { questao: string; hash: string }[]
  >([]);
  const [votando, setVotando] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState("");
  const [inadModal, setInadModal] = useState<
    { msg: string; whatsapp: string } | null
  >(null);

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
              onSuccess={(token, id) => {
                setManualId(id);
                setVotosPermitidos(1);
                setAuthToken(token);
              }}
              onEmail={() => setEntryMode("email")}
              onManual={() => setEntryMode("manual")}
            />
          )}
          {entryMode === "manual" && (
            <IdentificacaoManual
              assembleiaId={assembleiaId}
              onSuccess={(token, id) => {
                setManualId(id);
                setVotosPermitidos(1);
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
  const questoes = (assembleia.questoes || []).filter((q) => !q.encerrada);
  // Itens ainda não votados por este eleitor (inclui os bloqueados, que
  // permanecem pendentes até a administração liberar).
  const pendentes = questoes.filter((q) => !respondidas.includes(q.id));
  // Bloqueados ("aguarde o debate"): visíveis, mas não votáveis até liberar.
  const bloqueadasPendentes = pendentes.filter((q) => q.liberada === false);
  // A questão atual é a primeira pendente que já esteja liberada para votação.
  const questao = pendentes.find((q) => q.liberada !== false);
  const indiceAtual = questoes.length - pendentes.length;
  // Em voto por procuração cada unidade tem direito a 1 voto; a cota de
  // múltiplas unidades (votos_permitidos) vale só para o voto próprio.
  const cotaQuestao = ehProcuracao || ehDeclaracao ? 1 : votosPermitidos;

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
          <p className="text-gray-600">
            Sua presença está registrada. A votação será liberada pela administração em instantes — esta tela abre automaticamente.
          </p>
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
          <h1 className="text-2xl font-bold mb-2">Aguarde o próximo item</h1>
          <p className="text-gray-600">
            O próximo item será liberado para votação assim que o assunto for
            debatido. Mantenha esta página aberta — ela abrirá automaticamente
            quando a votação for liberada.
          </p>
        </div>
      </div>
    );
  }

  async function handleVotar() {
    if (!selectedOpcao || !questao || !authToken) return;
    setVotando(true);

    try {
      const result = await api.votar(assembleiaId, {
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
      });

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
      const data = err?.response?.data;
      if (data?.code === "inadimplente") {
        setInadModal({
          msg: data.error || "Entre em contato com sua administradora.",
          whatsapp: (data.whatsapp || "").replace(/\D/g, ""),
        });
      } else {
        alert(data?.error || "Erro ao registrar voto.");
      }
    } finally {
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
      <div className="card w-full max-w-md">
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

        <button
          onClick={handleVotar}
          disabled={!selectedOpcao || votando}
          className="btn-primary w-full"
        >
          {votando ? "Registrando..." : "Confirmar Voto"}
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

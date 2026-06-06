"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Vote, CheckCircle, Shield, Copy, Check, FileDown, ExternalLink, Image, Link2, Users, Clock, ArrowLeft, MessageCircle, X } from "lucide-react";
import { api, getDeviceId } from "@/lib/api";
import WebAuthnVerify from "@/components/webauthn/WebAuthnVerify";
import FaceVerify from "@/components/FaceVerify";
import OtpVerify from "@/components/OtpVerify";
import type { Assembleia, UnidadeVotante } from "@/lib/types";

export default function VotacaoPage() {
  const params = useParams();
  const assembleiaId = params.assembleia_id as string;

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"webauthn" | "facial" | "otp">("webauthn");
  const [currentQuestao, setCurrentQuestao] = useState(0);
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

  function abrirProcuracao() {
    setPickerOpen(true);
    if (unidades.length === 0) {
      api.getUnidades(assembleiaId).then(setUnidades).catch(() => {});
    }
  }

  function iniciarVotoProcuracao(u: UnidadeVotante) {
    setUnidadeProc(u);
    setEhProcuracao(true);
    setPickerOpen(false);
    setProcConcluida(false);
    setDone(false);
    setCurrentQuestao(0);
    setSelectedOpcao(null);
  }

  // eleitor_id comes from URL param (sent via convite link)
  const eleitorId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("eleitor") || ""
    : "";

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
    if (authToken) {
      api.registrarPresenca(assembleiaId, authToken).catch(() => {});
    }
  }, [assembleiaId, authToken]);

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

  // Auth gate — verify identity before voting
  if (!authToken && eleitorId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
        <div className="card w-full max-w-md">
          <div className="flex items-center gap-2 justify-center mb-6">
            <Vote className="w-7 h-7 text-primary-600" />
            <span className="font-bold text-lg">{assembleia.titulo}</span>
          </div>

          {authMethod === "webauthn" && (
            <WebAuthnVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token) => setAuthToken(token)}
              onFallback={() => setAuthMethod("facial")}
            />
          )}

          {authMethod === "facial" && (
            <FaceVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token) => setAuthToken(token)}
              onFallback={() => setAuthMethod("otp")}
            />
          )}

          {authMethod === "otp" && (
            <OtpVerify
              eleitorId={eleitorId}
              assembleiaId={assembleiaId}
              onSuccess={(token) => setAuthToken(token)}
            />
          )}
        </div>
      </div>
    );
  }

  const questoes = assembleia.questoes || [];
  const questao = questoes[currentQuestao];

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

  if (done || currentQuestao >= questoes.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white px-4">
        <div className="card w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Voto Registrado!</h1>
          <p className="text-gray-600 mb-6">
            Seus votos foram registrados com sucesso.
          </p>

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
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              const text = comprovantes
                .map((c) => `${c.questao}: ${c.hash}`)
                .join("\n");
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
        </div>
      </div>
    );
  }

  async function handleVotar() {
    if (!selectedOpcao || !questao || !authToken) return;
    setVotando(true);

    try {
      const result = await api.votar(assembleiaId, {
        eleitor_id: ehProcuracao && unidadeProc ? unidadeProc.id : eleitorId,
        questao_id: questao.id,
        opcao_id: selectedOpcao,
        auth_token: authToken,
        device_id: getDeviceId(),
        por_procuracao: ehProcuracao,
      });

      if (!ehProcuracao) {
        setComprovantes((prev) => [
          ...prev,
          { questao: questao.titulo, hash: result.hash_voto },
        ]);
      }
      setSelectedOpcao(null);

      if (currentQuestao + 1 >= questoes.length) {
        if (ehProcuracao) {
          if (unidadeProc) setProcFeitas((p) => [...p, unidadeProc.id]);
          setProcConcluida(true);
        } else {
          setDone(true);
        }
      } else {
        setCurrentQuestao((prev) => prev + 1);
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
        <div className="flex items-center gap-2 mb-6">
          <Vote className="w-6 h-6 text-primary-600" />
          <span className="text-sm text-gray-500">
            Questão {currentQuestao + 1} de {questoes.length}
          </span>
        </div>

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
              width: `${((currentQuestao + 1) / questoes.length) * 100}%`,
            }}
          />
        </div>
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

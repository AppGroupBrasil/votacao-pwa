"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Vote, CheckCircle, Shield, Copy, Check, FileDown, ExternalLink, Image, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import WebAuthnVerify from "@/components/webauthn/WebAuthnVerify";
import FaceVerify from "@/components/FaceVerify";
import OtpVerify from "@/components/OtpVerify";
import type { Assembleia } from "@/lib/types";

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

  // eleitor_id comes from URL param (sent via convite link)
  const eleitorId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("eleitor") || ""
    : "";

  useEffect(() => {
    api.getAssembleiaPublic(assembleiaId).then(setAssembleia).catch(() => {
      setError("Assembleia não encontrada.");
    });
  }, [assembleiaId]);

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
        </div>
      </div>
    );
  }

  async function handleVotar() {
    if (!selectedOpcao || !questao || !authToken) return;
    setVotando(true);

    try {
      const result = await api.votar(assembleiaId, {
        eleitor_id: eleitorId,
        questao_id: questao.id,
        opcao_id: selectedOpcao,
        auth_token: authToken,
      });

      setComprovantes((prev) => [
        ...prev,
        { questao: questao.titulo, hash: result.hash_voto },
      ]);
      setSelectedOpcao(null);

      if (currentQuestao + 1 >= questoes.length) {
        setDone(true);
      } else {
        setCurrentQuestao((prev) => prev + 1);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || "Erro ao registrar voto.";
      alert(msg);
    } finally {
      setVotando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
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

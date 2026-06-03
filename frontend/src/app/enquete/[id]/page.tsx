"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Check, Trophy, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { EnquetePublica, EnqueteResultado } from "@/lib/types";

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

  useEffect(() => {
    if (!id) return;
    if (typeof window !== "undefined" && localStorage.getItem(`enquete_${id}`)) {
      setJaVotou(true);
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

  async function votar() {
    if (!selecionada) {
      setErro("Selecione uma resposta.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await api.votarEnquete(id, selecionada);
      if (typeof window !== "undefined")
        localStorage.setItem(`enquete_${id}`, "1");
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
              ? "Resultado da votação"
              : "Votação anônima — escolha uma opção."}
          </p>

          {!jaVotou && !resultado && (
            <>
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
                  : "Confirmar voto"}
              </button>
            </>
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
            </div>
          );
        })}
      </div>
      {resultado.vencedor && total > 0 && (
        <div className="mt-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Trophy className="w-4 h-4" />
          Vencedor: <strong>{resultado.vencedor.texto}</strong> com{" "}
          {resultado.vencedor.votos} voto
          {resultado.vencedor.votos !== 1 ? "s" : ""} ({resultado.vencedor.percentual}%)
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { BarChart3, Lock, Vote } from "lucide-react";
import clsx from "clsx";

import { api } from "@/lib/api";
import type { Resultado, ResultadoPublico } from "@/lib/types";

// De quanto em quanto tempo o placar se atualiza sozinho. 6s dá sensação de
// "ao vivo" sem martelar o servidor durante a assembleia (o telão e todos os
// celulares da sala consultam ao mesmo tempo).
const INTERVALO_MS = 6000;

function QuestaoCard({ r }: { r: Resultado }) {
  const maxVotos = Math.max(0, ...r.opcoes.map((o) => o.votos));
  const vencedoras = r.opcoes.filter((o) => o.votos === maxVotos && maxVotos > 0);
  const empate = vencedoras.length > 1;

  return (
    <div className="card">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{r.questao_titulo}</h2>
        <span
          className={clsx(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            r.encerrada ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-700"
          )}
        >
          {r.encerrada ? "encerrada" : "em votação"}
        </span>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        {r.total_votos} voto{r.total_votos !== 1 ? "s" : ""}
        {typeof r.abstencoes === "number" &&
          ` · ${r.abstencoes} abstenç${r.abstencoes !== 1 ? "ões" : "ão"}`}
      </p>

      {r.encerrada && maxVotos > 0 && (
        <p
          className={clsx(
            "mb-4 text-sm font-medium",
            empate ? "text-amber-600" : "text-green-700"
          )}
        >
          {empate
            ? `Empate entre ${vencedoras.map((o) => o.texto).join(", ")} (${maxVotos} votos cada)`
            : `Vencedora: ${vencedoras[0].texto} (${maxVotos} voto${
                maxVotos !== 1 ? "s" : ""
              })`}
        </p>
      )}

      <div className="space-y-3">
        {r.opcoes.map((opcao) => {
          const pct =
            r.total_votos > 0 ? Math.round((opcao.votos / r.total_votos) * 100) : 0;
          const isVencedora =
            r.encerrada && !empate && opcao.votos === maxVotos && maxVotos > 0;
          return (
            <div key={opcao.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span className={clsx("font-medium", isVencedora && "text-green-700")}>
                  {isVencedora && "★ "}
                  {opcao.texto}
                </span>
                <span className="text-gray-500">
                  {opcao.votos} voto{opcao.votos !== 1 ? "s" : ""} ({pct}%)
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-500",
                    isVencedora ? "bg-green-500" : "bg-primary-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultadoAoVivoPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const assembleiaId = String(params?.assembleia_id || "");
  // ?q=<questao_id> abre só o item daquele link curto.
  const questaoId = searchParams.get("q") || "";

  const [dados, setDados] = useState<ResultadoPublico | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buscar = useCallback(async () => {
    if (!assembleiaId) return;
    try {
      const r = await api.getResultadoPublico(assembleiaId);
      setDados(r);
      setAtualizadoEm(new Date());
      setErro("");
    } catch {
      setErro("Não foi possível buscar o resultado agora.");
    } finally {
      setCarregando(false);
    }
  }, [assembleiaId]);

  useEffect(() => {
    buscar();
    // Só consulta com a aba visível: celular no bolso não fica pedindo dados.
    function ligar() {
      if (timerRef.current) return;
      timerRef.current = setInterval(buscar, INTERVALO_MS);
    }
    function desligar() {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    function aoTrocarVisibilidade() {
      if (document.visibilityState === "visible") {
        buscar();
        ligar();
      } else {
        desligar();
      }
    }
    ligar();
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    return () => {
      desligar();
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, [buscar]);

  const questoes = (dados?.questoes || []).filter(
    (q) => !questaoId || q.questao_id === questaoId
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-6">
          <div className="mb-8 flex items-center gap-2">
            <Vote className="h-6 w-6" />
            <span className="font-bold">Votação Online</span>
          </div>
          <p className="mb-1 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-primary-200">
            <BarChart3 className="h-4 w-4" />
            Resultado ao vivo
          </p>
          <h1 className="text-2xl font-bold leading-tight md:text-3xl">
            {dados?.titulo || "Carregando..."}
          </h1>
          {dados?.condominio_nome && (
            <p className="mt-1 text-primary-200">{dados.condominio_nome}</p>
          )}
        </div>
      </header>

      <main className="-mt-16 flex-1 px-4 pb-16">
        <div className="mx-auto max-w-3xl space-y-4">
          {carregando && (
            <div className="card text-center text-gray-500">Carregando resultado...</div>
          )}

          {!carregando && dados && !dados.liberado && (
            <div className="card text-center">
              <Lock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <h2 className="text-lg font-semibold">
                O resultado ainda não foi liberado
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Quem conduz a assembleia libera o placar quando os votos estiverem
                conferidos. Deixe esta página aberta: ela mostra o resultado assim
                que ele for liberado.
              </p>
            </div>
          )}

          {!carregando && dados?.liberado && questoes.length === 0 && (
            <div className="card text-center text-gray-500">
              Nenhum voto registrado ainda.
            </div>
          )}

          {dados?.liberado &&
            questoes.map((q) => <QuestaoCard key={q.questao_id} r={q} />)}

          {erro && <p className="text-center text-sm text-red-600">{erro}</p>}

          {dados?.liberado && (
            <p className="pt-2 text-center text-xs text-gray-400">
              Atualiza sozinho a cada 6 segundos
              {atualizadoEm &&
                ` · última atualização ${atualizadoEm.toLocaleTimeString("pt-BR")}`}
              . O voto é secreto: ninguém vê quem votou em quê.
            </p>
          )}
        </div>
      </main>

      <footer className="bg-gray-900 py-6 text-center text-xs text-gray-400">
        © 2026 Votação Online
      </footer>
    </div>
  );
}

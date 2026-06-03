"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Circle,
  Clock,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ControleVotacao } from "@/lib/types";

type Filtro = "todos" | "votaram" | "faltam";

export default function ControleVotacaoPage() {
  const params = useParams();
  const id = params.id as string;
  const [dados, setDados] = useState<ControleVotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(() => {
    if (!id) return;
    api
      .getControleVotacao(id)
      .then(setDados)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const eleitores = (dados?.eleitores || []).filter((e) => {
    if (filtro === "votaram" && !e.votou) return false;
    if (filtro === "faltam" && e.votou) return false;
    const q = busca.trim().toLowerCase();
    if (q && !`${e.nome} ${e.bloco} ${e.apartamento}`.toLowerCase().includes(q))
      return false;
    return true;
  });

  return (
    <div>
      <Link
        href={`/admin/assembleias/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar à assembleia
      </Link>

      <h1 className="text-2xl font-bold mb-1">Controle de votação</h1>
      <p className="text-sm text-gray-500 mb-6">
        Acompanhe quem já votou e quem falta. O voto é secreto: esta tela nunca
        mostra em qual opção cada pessoa votou.
      </p>

      {loading && !dados ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat label="Eleitores" valor={dados.resumo.total_eleitores} />
            <Stat
              label="Já votaram"
              valor={dados.resumo.votaram}
              cls="text-green-600"
            />
            <Stat
              label="Faltam"
              valor={dados.resumo.faltam}
              cls="text-amber-600"
            />
            <Stat
              label="Participação"
              valor={`${dados.resumo.percentual}%`}
            />
          </div>

          {dados.total_questoes > 1 && (
            <p className="text-xs text-gray-400 -mt-3 mb-4">
              &quot;Completo&quot; = respondeu todas as {dados.total_questoes}{" "}
              questões.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(["todos", "votaram", "faltam"] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-lg px-3 py-1.5 text-sm border ${
                  filtro === f
                    ? "border-primary-600 bg-primary-50 text-primary-700"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                {f === "todos"
                  ? "Todos"
                  : f === "votaram"
                  ? "Já votaram"
                  : "Faltam votar"}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="input-field pl-9 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Eleitor</th>
                  <th className="text-left font-medium px-4 py-2">Unidade</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  {dados.total_questoes > 1 && (
                    <th className="text-left font-medium px-4 py-2">Questões</th>
                  )}
                  <th className="text-left font-medium px-4 py-2">Último voto</th>
                </tr>
              </thead>
              <tbody>
                {eleitores.map((e) => (
                  <tr key={e.eleitor_id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{e.nome}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {e.bloco ? `Bl. ${e.bloco} · ` : ""}Ap. {e.apartamento}
                    </td>
                    <td className="px-4 py-2">
                      {e.votou ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          {e.completo || dados.total_questoes <= 1
                            ? "Votou"
                            : "Parcial"}
                        </span>
                      ) : e.pendente ? (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <Clock className="w-4 h-4" /> Pendente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400">
                          <Circle className="w-4 h-4" /> Não votou
                        </span>
                      )}
                    </td>
                    {dados.total_questoes > 1 && (
                      <td className="px-4 py-2 text-gray-500">
                        {e.respondidas}/{dados.total_questoes}
                      </td>
                    )}
                    <td className="px-4 py-2 text-gray-400">
                      {e.ultimo_voto
                        ? new Date(e.ultimo_voto).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {eleitores.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-400"
                    >
                      Nenhum eleitor neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  valor,
  cls = "",
}: {
  label: string;
  valor: number | string;
  cls?: string;
}) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${cls}`}>{valor}</p>
    </div>
  );
}

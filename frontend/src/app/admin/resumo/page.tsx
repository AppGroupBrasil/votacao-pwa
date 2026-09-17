"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  Loader2,
  Trophy,
  UserCheck,
  Vote,
} from "lucide-react";
import { clsx } from "clsx";

import { api } from "@/lib/api";
import type { Assembleia, AssembleiaListItem, Resultado } from "@/lib/types";

// Enquanto a assembleia está aberta, a parcial se atualiza sozinha.
const INTERVALO_MS = 8000;

const STATUS: Record<string, { label: string; classe: string }> = {
  rascunho: { label: "Não aberta", classe: "bg-amber-100 text-amber-700" },
  aberta: { label: "Em votação", classe: "bg-green-100 text-green-700" },
  encerrada: { label: "Encerrada", classe: "bg-gray-100 text-gray-600" },
};

type Dados = {
  detalhe?: Assembleia;
  resultados?: Resultado[];
  carregando: boolean;
  erro?: string;
};

function dataLonga(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Botão do PDF daquele relatório, dentro do card a que ele pertence. Fica
 *  fora da página porque a parcial se atualiza sozinha: um componente criado
 *  dentro do render seria remontado a cada atualização. */
function BotaoPdf({
  ocupado,
  rotulo,
  onClick,
}: {
  ocupado: boolean;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-2 disabled:opacity-60"
    >
      {ocupado ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Gerando PDF...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" /> {rotulo}
        </>
      )}
    </button>
  );
}

/** Barras de uma questão: a parcial do momento, ou o resultado final. */
function Placar({ r, encerrada }: { r: Resultado; encerrada: boolean }) {
  const maxVotos = Math.max(0, ...r.opcoes.map((o) => o.votos));
  const vencedoras = r.opcoes.filter((o) => o.votos === maxVotos && maxVotos > 0);
  const empate = vencedoras.length > 1;
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{r.questao_titulo}</p>
        <span className="shrink-0 text-xs text-gray-400">
          {r.total_votos} voto{r.total_votos !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {r.opcoes.map((o) => {
          const pct = r.total_votos > 0 ? Math.round((o.votos / r.total_votos) * 100) : 0;
          const ganhou = encerrada && !empate && o.votos === maxVotos && maxVotos > 0;
          return (
            <div key={o.id}>
              <div className="flex justify-between text-xs">
                <span className={clsx(ganhou && "font-semibold text-green-700")}>
                  {ganhou && "★ "}
                  {o.texto}
                </span>
                <span className="text-gray-500">
                  {o.votos} ({pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-500",
                    ganhou ? "bg-green-500" : "bg-primary-500"
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

export default function ResumoPage() {
  const [assembleias, setAssembleias] = useState<AssembleiaListItem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [aberta, setAberta] = useState<string>("");
  const [dados, setDados] = useState<Record<string, Dados>>({});
  // Qual PDF está sendo gerado agora ("<id>:<tipo>"), para travar só aquele botão.
  const [baixando, setBaixando] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .getAssembleias()
      .then((d) => setAssembleias(d.results || (d as any)))
      .finally(() => setCarregandoLista(false));
  }, []);

  const carregar = useCallback(async (id: string, silencioso = false) => {
    if (!silencioso) {
      setDados((d) => ({ ...d, [id]: { ...(d[id] || {}), carregando: true } }));
    }
    try {
      const [detalhe, resultados] = await Promise.all([
        api.getAssembleia(id),
        api.getResultados(id),
      ]);
      setDados((d) => ({ ...d, [id]: { detalhe, resultados, carregando: false } }));
    } catch {
      setDados((d) => ({
        ...d,
        [id]: { ...(d[id] || {}), carregando: false, erro: "Não foi possível carregar." },
      }));
    }
  }, []);

  // A parcial só se repete sozinha na assembleia aberta que está na tela.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const atual = assembleias.find((a) => a.id === aberta);
    if (!aberta || atual?.status !== "aberta") return;
    timerRef.current = setInterval(() => carregar(aberta, true), INTERVALO_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [aberta, assembleias, carregar]);

  async function baixarRelatorio(
    a: AssembleiaListItem,
    tipo: "presenca" | "votacao" | "resultado"
  ) {
    setBaixando(`${a.id}:${tipo}`);
    try {
      const blob = await api.baixarRelatorioPdf(a.id, tipo);
      const nome = (a.titulo || "assembleia")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .slice(0, 60);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tipo}-${nome}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao gerar o relatório em PDF.");
    } finally {
      setBaixando("");
    }
  }

  function alternar(id: string) {
    if (aberta === id) {
      setAberta("");
      return;
    }
    setAberta(id);
    // "No momento em que se clicou": a parcial é buscada agora.
    carregar(id);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Resumo das votações</h1>
        <p className="text-sm text-gray-500">
          Todas as assembleias, da mais recente para a mais antiga. Abra uma para
          ver a lista de presença, as perguntas com a parcial do momento e o
          resultado.
        </p>
      </div>

      {carregandoLista ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : assembleias.length === 0 ? (
        <div className="card py-10 text-center">
          <Vote className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <h2 className="mb-1 text-lg font-semibold">Nenhuma votação ainda</h2>
          <p className="mx-auto mb-5 max-w-md text-sm text-gray-500">
            Quando você criar uma assembleia, ela aparece aqui com a presença, as
            perguntas e o resultado.
          </p>
          <Link href="/admin/assembleias/nova-simples" className="btn-primary inline-flex">
            Criar assembleia
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {assembleias.map((a) => {
            const s = STATUS[a.status] || STATUS.rascunho;
            const d = dados[a.id];
            const expandida = aberta === a.id;
            const encerrada = a.status === "encerrada";
            const resultados = d?.resultados || [];
            const presentes = d?.detalhe?.total_presentes ?? 0;
            const totalVotos = resultados.reduce((n, r) => n + r.total_votos, 0);
            return (
              <div key={a.id} className="card">
                {/* Cabeçalho: tipo, data, descrição e situação */}
                <button
                  type="button"
                  onClick={() => alternar(a.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{a.titulo}</h2>
                      <span
                        className={clsx(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          s.classe
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {dataLonga(a.data_inicio)}
                      </span>
                      <span>· {a.condominio_nome}</span>
                    </p>
                    {a.descricao && (
                      <p className="mt-1 text-sm text-gray-600">{a.descricao}</p>
                    )}
                  </div>
                  {expandida ? (
                    <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                  )}
                </button>

                {expandida && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    {d?.carregando && (
                      <p className="flex items-center gap-2 text-sm text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Buscando os
                        números desta assembleia...
                      </p>
                    )}
                    {d?.erro && <p className="text-sm text-red-600">{d.erro}</p>}

                    {!d?.carregando && !d?.erro && (
                      <div className="grid gap-4 lg:grid-cols-3">
                        {/* 1 — Lista de presença */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <h3 className="flex items-center gap-2 font-semibold">
                            <UserCheck className="h-5 w-5 text-indigo-600" /> Lista
                            de presença
                          </h3>
                          <p className="mt-2 text-3xl font-bold">{presentes}</p>
                          <p className="text-sm text-gray-500">
                            {presentes === 1 ? "presença registrada" : "presenças registradas"}
                          </p>
                          <Link
                            href={`/admin/assembleias/${a.id}/presenca`}
                            className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2"
                          >
                            <ClipboardList className="h-4 w-4" /> Abrir a lista
                          </Link>
                          <BotaoPdf
                            ocupado={baixando === `${a.id}:presenca`}
                            rotulo="Relatório de presença"
                            onClick={() => baixarRelatorio(a, "presenca")}
                          />
                        </div>

                        {/* 2 — Perguntas, com a parcial de cada uma */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <h3 className="flex items-center gap-2 font-semibold">
                            <Vote className="h-5 w-5 text-primary-600" /> Votação
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {encerrada
                              ? `${resultados.length} pergunta${resultados.length !== 1 ? "s" : ""} · votação encerrada`
                              : "Parcial do momento, atualizando sozinha"}
                          </p>
                          <div className="mt-3 space-y-4">
                            {resultados.length === 0 && (
                              <p className="text-sm text-gray-400">
                                Nenhuma pergunta com voto ainda.
                              </p>
                            )}
                            {resultados.map((r) => (
                              <Placar
                                key={r.questao_id}
                                r={r}
                                encerrada={encerrada || !!r.encerrada}
                              />
                            ))}
                          </div>
                          <Link
                            href={`/admin/assembleias/${a.id}`}
                            className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2"
                          >
                            <Vote className="h-4 w-4" /> Abrir a votação
                          </Link>
                          <BotaoPdf
                            ocupado={baixando === `${a.id}:votacao`}
                            rotulo="Relatório de votação"
                            onClick={() => baixarRelatorio(a, "votacao")}
                          />
                        </div>

                        {/* 3 — Resultado: final quando encerrada, parcial enquanto corre */}
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                          <h3 className="flex items-center gap-2 font-semibold">
                            <Trophy className="h-5 w-5 text-sky-600" />
                            {encerrada ? "Resultado final" : "Resultado parcial"}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            {encerrada
                              ? `${totalVotos} voto${totalVotos !== 1 ? "s" : ""} apurados`
                              : "O resultado final sai quando a assembleia for encerrada."}
                          </p>
                          <ul className="mt-3 space-y-3">
                            {resultados.length === 0 && (
                              <li className="text-sm text-gray-400">
                                Sem votos até agora.
                              </li>
                            )}
                            {resultados.map((r) => {
                              const max = Math.max(0, ...r.opcoes.map((o) => o.votos));
                              const lideres = r.opcoes.filter(
                                (o) => o.votos === max && max > 0
                              );
                              const empate = lideres.length > 1;
                              return (
                                <li key={r.questao_id} className="text-sm">
                                  <p className="font-medium">{r.questao_titulo}</p>
                                  {max === 0 ? (
                                    <p className="text-gray-400">sem votos</p>
                                  ) : empate ? (
                                    <p className="text-amber-600">
                                      Empate entre {lideres.map((o) => o.texto).join(", ")} ({max} cada)
                                    </p>
                                  ) : (
                                    <p
                                      className={clsx(
                                        encerrada && r.encerrada
                                          ? "text-green-700"
                                          : "text-gray-600"
                                      )}
                                    >
                                      {encerrada && r.encerrada ? "Vencedora: " : "À frente: "}
                                      {lideres[0].texto} ({max} voto{max !== 1 ? "s" : ""}
                                      {r.total_votos > 0
                                        ? ` · ${Math.round((max / r.total_votos) * 100)}%`
                                        : ""}
                                      )
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          <Link
                            href={`/admin/assembleias?tab=resultados&id=${a.id}`}
                            className="btn-secondary mt-4 inline-flex w-full items-center justify-center gap-2"
                          >
                            <BarChart3 className="h-4 w-4" /> Resultado completo
                          </Link>
                          <BotaoPdf
                            ocupado={baixando === `${a.id}:resultado`}
                            rotulo="Relatório do resultado"
                            onClick={() => baixarRelatorio(a, "resultado")}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

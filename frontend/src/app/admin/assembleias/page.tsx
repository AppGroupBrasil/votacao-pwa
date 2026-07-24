"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Calendar,
  Users,
  ChevronRight,
  Trash2,
  Square,
  ClipboardList,
  Download,
  Clock,
  Check,
  X,
  Camera,
  Vote,
  BarChart3,
  FileText,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AssembleiaListItem,
  Resultado,
  ProcuracaoPendente,
  VotanteManualAdmin,
} from "@/lib/types";
import { clsx } from "clsx";

type Tab = "votacao" | "resultados" | "relatorio";

const statusMap = {
  rascunho: { label: "Rascunho", class: "bg-gray-100 text-gray-700" },
  aberta: { label: "Aberta", class: "bg-green-100 text-green-700" },
  encerrada: { label: "Encerrada", class: "bg-red-100 text-red-700" },
};

const abas: { id: Tab; label: string; icon: typeof Vote }[] = [
  { id: "votacao", label: "Votação", icon: Vote },
  { id: "resultados", label: "Resultados", icon: BarChart3 },
  { id: "relatorio", label: "Relatório", icon: FileText },
];

export default function AssembleiasHubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("votacao");

  // Lista
  const [assembleias, setAssembleias] = useState<AssembleiaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Resultados / relatório
  const [selected, setSelected] = useState<string>("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [pendentes, setPendentes] = useState<ProcuracaoPendente[]>([]);
  const [manuais, setManuais] = useState<VotanteManualAdmin[]>([]);
  const [selfieAberta, setSelfieAberta] = useState<string>("");
  const [loadingResultados, setLoadingResultados] = useState(false);
  const [exporting, setExporting] = useState(false);

  function loadAssembleias() {
    api
      .getAssembleias()
      .then((data) => {
        const items = data.results || data;
        setAssembleias(items);
        setSelected(
          (prev) =>
            prev ||
            items.find((a: AssembleiaListItem) => a.status === "aberta")?.id ||
            ""
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAssembleias();
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "resultados" || t === "relatorio") setTab(t);
  }, []);

  const carregarPendentes = useCallback((id: string) => {
    api
      .getProcuracoesPendentes(id)
      .then((d) => setPendentes(d.unidades))
      .catch(() => setPendentes([]));
    api
      .getVotosManuais(id)
      .then((d) => setManuais(d.votantes))
      .catch(() => setManuais([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoadingResultados(true);
    api
      .getResultados(selected)
      .then(setResultados)
      .finally(() => setLoadingResultados(false));
    carregarPendentes(selected);
  }, [selected, carregarPendentes]);

  // Auto-atualiza a cada 5s enquanto a assembleia estiver aberta
  useEffect(() => {
    if (!selected) return;
    const current = assembleias.find((a) => a.id === selected);
    if (current?.status !== "aberta") return;
    const interval = setInterval(() => {
      api.getResultados(selected).then(setResultados);
    }, 5000);
    return () => clearInterval(interval);
  }, [selected, assembleias]);

  async function handleDelete(e: React.MouseEvent, id: string, titulo: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir a assembleia "${titulo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.deleteAssembleia(id);
      setAssembleias((prev) => prev.filter((a) => a.id !== id));
    } catch {
      alert("Erro ao excluir assembleia.");
    }
  }

  async function handleEncerrar(e: React.MouseEvent, id: string, titulo: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`ATENÇÃO: Encerrar a votação "${titulo}" IMEDIATAMENTE?\n\nNenhum morador poderá mais votar após esta ação.`)) return;
    if (!confirm("Confirmar encerramento? Clique OK para encerrar agora.")) return;
    try {
      await api.encerrarAssembleia(id);
      loadAssembleias();
    } catch {
      alert("Erro ao encerrar assembleia.");
    }
  }

  async function validar(p: ProcuracaoPendente, acao: "aprovar" | "rejeitar") {
    await api.validarProcuracao(selected, { tipo: p.tipo, id: p.id }, acao);
    carregarPendentes(selected);
    api.getResultados(selected).then(setResultados);
  }

  async function validarManual(
    votante: VotanteManualAdmin,
    acao: "aprovar" | "rejeitar"
  ) {
    await api.validarVotoManual(selected, votante.id, acao);
    carregarPendentes(selected);
    api.getResultados(selected).then(setResultados);
  }

  function csvValue(value: string | number | boolean | null | undefined) {
    const text = value == null ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  async function exportarRelatorioDetalhado() {
    if (!selected) return;
    setExporting(true);
    try {
      const relatorio = await api.getRelatorioVotos(selected);
      const header = [
        "Nome",
        "Bloco",
        "Apartamento",
        "Perfil",
        "Por procuração",
        "Questão",
        "Opção escolhida",
        "Tipo da autenticação",
        "IP",
        "Aparelho/Navegador",
        "User-Agent",
        "Data e horário",
        "Hash do voto",
      ];
      const rows = relatorio.votos.map((voto) => [
        voto.eleitor_nome,
        voto.bloco,
        voto.apartamento,
        voto.perfil,
        voto.por_procuracao ? "Sim" : "Não",
        voto.questao_titulo,
        voto.opcao_texto,
        voto.tipo_autenticacao,
        voto.ip_address,
        voto.device_info,
        voto.user_agent,
        new Date(voto.timestamp).toLocaleString("pt-BR"),
        voto.hash_voto,
      ]);
      const csv = [header, ...rows]
        .map((row) => row.map((value) => csvValue(value)).join(";"))
        .join("\r\n");
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-votos-${relatorio.assembleia_titulo.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar relatório detalhado.");
    } finally {
      setExporting(false);
    }
  }

  const assembleiaPresenca =
    assembleias.find((a) => a.status === "aberta") || assembleias[0];
  const aoVivo =
    !!selected && assembleias.find((a) => a.id === selected)?.status === "aberta";

  function SeletorAssembleia() {
    return (
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="input-field w-full md:w-80"
      >
        <option value="">Selecione uma assembleia...</option>
        {assembleias.map((a) => (
          <option key={a.id} value={a.id}>
            {a.titulo} ({a.status})
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      {/* Abas */}
      <div className="mb-6 flex items-center gap-1 border-b border-gray-200">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setTab(a.id)}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === a.id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            <a.icon className="w-4 h-4" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Aba: Votação */}
      {tab === "votacao" && (
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="text-2xl font-bold">Assembleias</h1>
            <div className="flex flex-wrap items-center gap-2">
              {assembleiaPresenca ? (
                <Link
                  href={`/admin/assembleias/${assembleiaPresenca.id}/presenca`}
                  className="btn-secondary flex items-center gap-2"
                >
                  <ClipboardList className="w-4 h-4" />
                  Lista de Presença
                </Link>
              ) : (
                <button
                  disabled
                  title="Cadastre uma assembleia para ver a lista de presença"
                  className="btn-secondary flex items-center gap-2 opacity-50 cursor-not-allowed"
                >
                  <ClipboardList className="w-4 h-4" />
                  Lista de Presença
                </button>
              )}
              <Link href="/admin/assembleias/nova" className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Nova Assembleia
              </Link>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500">Carregando...</p>
          ) : assembleias.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500">Nenhuma assembleia cadastrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assembleias.map((a) => {
                const st = statusMap[a.status];
                return (
                  <Link
                    key={a.id}
                    href={`/admin/assembleias/${a.id}`}
                    className="card flex items-center justify-between hover:shadow-md transition-shadow group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{a.titulo}</h3>
                        <span
                          className={clsx(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            st.class
                          )}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(a.data_inicio).toLocaleDateString("pt-BR")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {a.total_votantes} votante{a.total_votantes !== 1 ? "s" : ""}
                        </span>
                        <span>{a.total_questoes} questão(ões)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/admin/assembleias/${a.id}/presenca`);
                        }}
                        className="text-gray-300 hover:text-primary-600 p-1.5 rounded hover:bg-primary-50 transition-colors"
                        title="Lista de presença"
                      >
                        <ClipboardList className="w-4 h-4" />
                      </button>
                      {a.status === "aberta" && (
                        <button
                          onClick={(e) => handleEncerrar(e, a.id, a.titulo)}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="Encerrar votação"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      )}
                      {a.status !== "aberta" && (
                        <button
                          onClick={(e) => handleDelete(e, a.id, a.titulo)}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-600 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba: Resultados */}
      {tab === "resultados" && (
        <div>
          <h1 className="text-2xl font-bold mb-4 flex items-center gap-3">
            Resultados
            {aoVivo && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                ao vivo
              </span>
            )}
          </h1>

          <div className="mb-6">
            <SeletorAssembleia />
          </div>

          {selected && pendentes.length > 0 && (
            <div className="card mb-6 border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-amber-800">
                  Faltam registrar {pendentes.length} voto
                  {pendentes.length !== 1 ? "s" : ""} por procuração / mais de uma
                  unidade
                </h3>
              </div>
              <p className="text-sm text-amber-700 mb-4">
                Esses votos só entram na totalização após sua validação.
              </p>
              <div className="space-y-2">
                {pendentes.map((p) => (
                  <div
                    key={`${p.tipo}:${p.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {p.bloco ? `${p.bloco} / ` : ""}
                        {p.apartamento} — {p.nome}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {p.tipo === "declarada"
                          ? `Declarada por: ${p.procurador_nome} · `
                          : p.procurador_nome
                          ? `Procurador: ${p.procurador_nome} · `
                          : ""}
                        {p.votos.length} voto{p.votos.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => validar(p, "aprovar")}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
                      >
                        <Check className="w-4 h-4" /> Aprovar
                      </button>
                      <button
                        onClick={() => validar(p, "rejeitar")}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
                      >
                        <X className="w-4 h-4" /> Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selected && manuais.length > 0 && (
            <div className="card mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-5 h-5 text-primary-600" />
                <h3 className="font-semibold">
                  Votos manuais com selfie ({manuais.length})
                </h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Moradores sem cadastro que votaram pela via manual. O voto vale
                imediatamente; confira a selfie e invalide se não reconhecer a
                pessoa. Votos pendentes (unidade já tinha votado) só entram na
                totalização após sua aprovação.
              </p>
              <div className="space-y-2">
                {manuais.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.selfie}
                        alt={`Selfie de ${v.nome}`}
                        onClick={() => setSelfieAberta(v.selfie)}
                        className="w-12 h-12 rounded-lg object-cover shrink-0 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {v.bloco ? `${v.bloco} / ` : ""}
                          {v.apartamento} — {v.nome}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {new Date(v.horario).toLocaleString("pt-BR")} ·{" "}
                          {v.total_votos} voto{v.total_votos !== 1 ? "s" : ""} ·{" "}
                          <span
                            className={
                              v.situacao === "pendente"
                                ? "text-amber-600 font-medium"
                                : v.situacao === "rejeitado"
                                ? "text-red-600 font-medium"
                                : "text-green-600 font-medium"
                            }
                          >
                            {v.situacao === "pendente"
                              ? "aguardando validação"
                              : v.situacao === "rejeitado"
                              ? "invalidado"
                              : v.situacao === "sem_votos"
                              ? "sem votos"
                              : "contabilizado"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v.situacao === "pendente" && (
                        <button
                          onClick={() => validarManual(v, "aprovar")}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
                        >
                          <Check className="w-4 h-4" /> Aprovar
                        </button>
                      )}
                      {v.situacao !== "rejeitado" && v.total_votos > 0 && (
                        <button
                          onClick={() => validarManual(v, "rejeitar")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
                        >
                          <X className="w-4 h-4" /> Invalidar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selfieAberta && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setSelfieAberta("")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfieAberta}
                alt="Selfie ampliada"
                className="max-h-[80vh] max-w-full rounded-lg"
              />
            </div>
          )}

          {loadingResultados && <p className="text-gray-500">Carregando resultados...</p>}

          {!loadingResultados && resultados.length > 0 && (
            <div className="space-y-6">
              {resultados.map((r) => (
                <div key={r.questao_id} className="card">
                  <h3 className="font-semibold text-lg mb-1">{r.questao_titulo}</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {r.total_votos} de {r.total_votantes} votos (
                    {r.percentual_participacao}%)
                  </p>
                  <div className="space-y-3">
                    {r.opcoes.map((opcao) => {
                      const pct =
                        r.total_votos > 0
                          ? Math.round((opcao.votos / r.total_votos) * 100)
                          : 0;
                      return (
                        <div key={opcao.id}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{opcao.texto}</span>
                            <span className="text-gray-500">
                              {opcao.votos} voto{opcao.votos !== 1 ? "s" : ""} ({pct}%)
                            </span>
                          </div>
                          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingResultados && selected && resultados.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-gray-500">Nenhum voto registrado ainda.</p>
            </div>
          )}

          {!selected && (
            <div className="card text-center py-8">
              <p className="text-gray-500">Selecione uma assembleia para ver os resultados.</p>
            </div>
          )}
        </div>
      )}

      {/* Aba: Relatório */}
      {tab === "relatorio" && (
        <div>
          <h1 className="text-2xl font-bold mb-4">Relatório detalhado</h1>
          <div className="mb-4">
            <SeletorAssembleia />
          </div>
          <div className="card">
            <button
              onClick={exportarRelatorioDetalhado}
              disabled={!selected || exporting}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? "Gerando relatório..." : "Exportar Relatório Detalhado (CSV)"}
            </button>
            <p className="mt-3 text-sm text-gray-500">
              O relatório detalhado inclui nome, bloco, apartamento, perfil, IP,
              autenticação, data/hora e aparelho inferido pelo navegador no
              momento do voto.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Calendar,
  Users,
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
  Link as LinkIcon,
  ExternalLink,
  Share2,
  Ban,
  RotateCcw,
  Play,
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

// Os três relatórios oficiais. Só existem estes; todos saem em PDF.
const RELATORIOS: {
  tipo: "presenca" | "votacao" | "resultado";
  titulo: string;
  descricao: string;
  icone: typeof Vote;
  fundo: string;
  itens: string[];
}[] = [
  {
    tipo: "presenca",
    titulo: "Lista de presença",
    descricao: "Quem esteve na assembleia, para anexar à ata.",
    icone: Users,
    fundo: "bg-primary-600",
    itens: [
      "Nome, unidade e perfil de cada presente",
      "Quórum, presenciais e online",
      "Inadimplentes destacados",
      "Linhas de assinatura no final",
    ],
  },
  {
    tipo: "votacao",
    titulo: "Relatório de votação",
    descricao: "Voto a voto, com tudo que comprova cada registro.",
    icone: ClipboardList,
    fundo: "bg-sky-600",
    itens: [
      "Separado por questão, na ordem",
      "Autenticação, IP, aparelho e horário",
      "Código do voto para conferência",
      "Pendentes e invalidados sinalizados",
    ],
  },
  {
    tipo: "resultado",
    titulo: "Relatório do resultado",
    descricao: "A apuração final de cada questão.",
    icone: BarChart3,
    fundo: "bg-green-600",
    itens: [
      "Total de votos e percentual por opção",
      "Opção vencedora em destaque",
      "Abstenções e votos válidos",
      "Aviso de empate quando houver",
    ],
  },
];

const abas: { id: Tab; label: string; icon: typeof Vote }[] = [
  { id: "votacao", label: "Votação", icon: Vote },
  { id: "resultados", label: "Resultados", icon: BarChart3 },
  { id: "relatorio", label: "Relatório", icon: FileText },
];

export default function AssembleiasHubPage() {
  const [tab, setTab] = useState<Tab>("votacao");

  // Lista
  const [assembleias, setAssembleias] = useState<AssembleiaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState<string>("");

  // Resultados / relatório
  const [selected, setSelected] = useState<string>("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [pendentes, setPendentes] = useState<ProcuracaoPendente[]>([]);
  const [manuais, setManuais] = useState<VotanteManualAdmin[]>([]);
  const [selfieAberta, setSelfieAberta] = useState<string>("");
  // Opção cuja lista "quem votou" está aberta (admin-only). Uma por vez.
  const [opcaoAberta, setOpcaoAberta] = useState<string>("");
  const [loadingResultados, setLoadingResultados] = useState(false);
  // Qual dos três PDFs está sendo gerado agora (null = nenhum).
  const [exporting, setExporting] = useState<string | null>(null);

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
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "resultados" || t === "relatorio") setTab(t);
    // ?id=<assembleia> vindo do botão "Resultado" dos cards: já abre o
    // resultado daquela assembleia, sem o síndico ter de escolher na lista.
    const id = params.get("id");
    if (id) setSelected(id);
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

  function verResultado(id: string) {
    setSelected(id);
    setTab("resultados");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  async function handleAbrir(e: React.MouseEvent, id: string, titulo: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Abrir a votação "${titulo}" agora?\n\nOs moradores só conseguem votar depois desta ação.`)) return;
    try {
      await api.abrirAssembleia(id);
      loadAssembleias();
    } catch {
      alert("Erro ao abrir a votação.");
    }
  }

  function linkPublico(a: AssembleiaListItem) {
    if (typeof window === "undefined") return "";
    if (a.codigo_curto) {
      return `${window.location.origin}/vote/${a.codigo_curto}`;
    }
    return `${window.location.origin}/votacao/${a.id}`;
  }

  async function copiarLink(a: AssembleiaListItem) {
    try {
      await navigator.clipboard.writeText(linkPublico(a));
      setCopiado(a.id);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* ignore */
    }
  }

  async function compartilhar(a: AssembleiaListItem) {
    const url = linkPublico(a);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Votação", url });
        return;
      } catch {
        /* usuário cancelou ou não suportado: cai no copiar */
      }
    }
    await copiarLink(a);
  }

  async function validar(p: ProcuracaoPendente, acao: "aprovar" | "rejeitar") {
    await api.validarProcuracao(selected, { tipo: p.tipo, id: p.id }, acao);
    carregarPendentes(selected);
    api.getResultados(selected).then(setResultados);
  }

  async function validarManual(
    votante: VotanteManualAdmin,
    acao: "aprovar" | "rejeitar" | "inadimplente" | "regularizar"
  ) {
    if (
      acao === "inadimplente" &&
      !confirm(
        `Marcar ${votante.nome} (${votante.bloco ? `${votante.bloco} / ` : ""}${votante.apartamento}) como INADIMPLENTE?\n\n` +
          "Os votos dele são invalidados e a unidade fica impedida de votar. Dá para desfazer depois."
      )
    )
      return;
    await api.validarVotoManual(selected, votante.id, acao);
    carregarPendentes(selected);
    api.getResultados(selected).then(setResultados);
  }

  async function baixarRelatorio(tipo: "presenca" | "votacao" | "resultado") {
    if (!selected) return;
    setExporting(tipo);
    try {
      const blob = await api.baixarRelatorioPdf(selected, tipo);
      const nome = (assembleias.find((a) => a.id === selected)?.titulo || "assembleia")
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
      setExporting(null);
    }
  }

  const assembleiaPresenca =
    assembleias.find((a) => a.status === "aberta") || assembleias[0];
  const aoVivo =
    !!selected && assembleias.find((a) => a.id === selected)?.status === "aberta";
  const selecionada = assembleias.find((a) => a.id === selected);

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
            <div className="space-y-4">
              {assembleias.map((a) => {
                const st = statusMap[a.status];
                return (
                  <div key={a.id} className="card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg truncate">
                            {a.titulo}
                          </h3>
                          <span
                            className={clsx(
                              "text-xs font-medium px-2 py-0.5 rounded-full",
                              st.class
                            )}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(a.data_inicio).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {a.total_votantes} votante
                            {a.total_votantes !== 1 ? "s" : ""}
                          </span>
                          <span>
                            {a.total_questoes} pergunta
                            {a.total_questoes !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {/* Atalho: troca para a aba Resultados já com esta
                            assembleia selecionada — um clique em vez de
                            trocar de aba e procurar na lista. */}
                        <button
                          onClick={() => verResultado(a.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
                        >
                          <BarChart3 className="w-4 h-4 text-white" /> Resultado
                        </button>
                        <Link
                          href={`/admin/assembleias/${a.id}`}
                          className="btn-secondary inline-flex items-center gap-1 text-sm"
                        >
                          <ClipboardList className="w-4 h-4" /> Gerenciar
                        </Link>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => copiarLink(a)}
                        className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
                      >
                        {copiado === a.id ? (
                          <>
                            <Check className="w-4 h-4" /> Copiado!
                          </>
                        ) : (
                          <>
                            <LinkIcon className="w-4 h-4" /> Copiar link
                          </>
                        )}
                      </button>
                      <a
                        href={linkPublico(a)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
                      >
                        <ExternalLink className="w-4 h-4" /> Ver página
                      </a>
                      {a.status === "rascunho" && (
                        <button
                          onClick={(e) => handleAbrir(e, a.id, a.titulo)}
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-blue-700/30 hover:bg-blue-700"
                        >
                          <Play className="w-4 h-4" /> Abrir votação
                        </button>
                      )}
                      <button
                        onClick={() => compartilhar(a)}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
                      >
                        <Share2 className="w-4 h-4" /> Compartilhar
                      </button>
                      {a.status === "aberta" && (
                        <button
                          onClick={(e) => handleEncerrar(e, a.id, a.titulo)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <Square className="w-4 h-4" /> Encerrar
                        </button>
                      )}
                      {a.status !== "aberta" && (
                        <button
                          onClick={(e) => handleDelete(e, a.id, a.titulo)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
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
                totalização após sua aprovação. Use <b>Inadimplente</b> quando a
                unidade estiver em débito: o voto é invalidado, a linha fica
                vermelha e a unidade não vota mais nesta assembleia.
              </p>
              <div className="space-y-2">
                {manuais.map((v) => (
                  <div
                    key={v.id}
                    className={clsx(
                      "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                      // Inadimplente: linha inteira em vermelho para o síndico
                      // achar de longe quem está impedido de votar.
                      v.inadimplente
                        ? "border-red-400 bg-red-50 ring-1 ring-red-200"
                        : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.selfie}
                        alt={`Selfie de ${v.nome}`}
                        onClick={() => setSelfieAberta(v.selfie)}
                        className={clsx(
                          "w-12 h-12 rounded-lg object-cover shrink-0 cursor-pointer",
                          v.inadimplente && "ring-2 ring-red-500"
                        )}
                      />
                      <div className="min-w-0">
                        <p
                          className={clsx(
                            "font-medium truncate",
                            v.inadimplente && "text-red-700"
                          )}
                        >
                          {v.bloco ? `${v.bloco} / ` : ""}
                          {v.apartamento} — {v.nome}
                          {v.inadimplente && (
                            <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                              Inadimplente
                            </span>
                          )}
                        </p>
                        <p
                          className={clsx(
                            "text-xs truncate",
                            v.inadimplente ? "text-red-600" : "text-gray-500"
                          )}
                        >
                          {new Date(v.horario).toLocaleString("pt-BR")} ·{" "}
                          {v.total_votos} voto{v.total_votos !== 1 ? "s" : ""} ·{" "}
                          <span
                            className={
                              v.inadimplente
                                ? "text-red-700 font-semibold"
                                : v.situacao === "pendente"
                                ? "text-amber-600 font-medium"
                                : v.situacao === "rejeitado"
                                ? "text-red-600 font-medium"
                                : "text-green-600 font-medium"
                            }
                          >
                            {v.inadimplente
                              ? "invalidado por inadimplência"
                              : v.situacao === "pendente"
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
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                      {v.inadimplente ? (
                        <button
                          onClick={() => validarManual(v, "regularizar")}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <RotateCcw className="w-4 h-4" /> Tirar inadimplência
                        </button>
                      ) : (
                        <button
                          onClick={() => validarManual(v, "inadimplente")}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          <Ban className="w-4 h-4" /> Inadimplente
                        </button>
                      )}
                      {!v.inadimplente && v.situacao === "pendente" && (
                        <button
                          onClick={() => validarManual(v, "aprovar")}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
                        >
                          <Check className="w-4 h-4" /> Aprovar
                        </button>
                      )}
                      {!v.inadimplente &&
                        v.situacao !== "rejeitado" &&
                        v.total_votos > 0 && (
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
              {/* Cabeçalho da apuração — condomínio, título, data, presença */}
              {selecionada && (
                <div className="card flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold">{selecionada.titulo}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {selecionada.condominio_nome}
                      {selecionada.data_inicio &&
                        ` · ${new Date(selecionada.data_inicio).toLocaleDateString(
                          "pt-BR"
                        )}`}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-medium">
                        {selecionada.total_votantes}
                      </span>{" "}
                      unidade{selecionada.total_votantes !== 1 ? "s" : ""} apta
                      {selecionada.total_votantes !== 1 ? "s" : ""} a votar
                    </p>
                  </div>
                  <button
                    onClick={() => window.print()}
                    className="btn-secondary inline-flex items-center gap-2 print:hidden shrink-0"
                  >
                    <Download className="w-4 h-4" /> Imprimir / PDF
                  </button>
                </div>
              )}

              {resultados.map((r) => {
                const maxVotos = Math.max(
                  0,
                  ...r.opcoes.map((o) => o.votos)
                );
                const vencedoras = r.opcoes.filter(
                  (o) => o.votos === maxVotos && maxVotos > 0
                );
                const empate = vencedoras.length > 1;
                const mostrarPeso =
                  typeof r.total_pessoas === "number" &&
                  r.total_pessoas !== r.total_votos;
                return (
                  <div key={r.questao_id} className="card">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="font-semibold text-lg">{r.questao_titulo}</h3>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                          r.encerrada
                            ? "bg-gray-100 text-gray-600"
                            : "bg-green-50 text-green-700"
                        )}
                      >
                        {r.encerrada ? "encerrada" : "em votação"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-1">
                      {r.total_votos} voto{r.total_votos !== 1 ? "s" : ""}
                      {mostrarPeso &&
                        ` · ${r.total_pessoas} pessoa${
                          r.total_pessoas !== 1 ? "s" : ""
                        }`}
                      {typeof r.abstencoes === "number" &&
                        ` · ${r.abstencoes} abstenç${
                          r.abstencoes !== 1 ? "ões" : "ão"
                        }`}
                      {` · ${r.percentual_participacao}% de participação`}
                    </p>

                    {/* Vencedor só depois que a questão é encerrada */}
                    {r.encerrada && maxVotos > 0 && (
                      <p
                        className={clsx(
                          "text-sm font-medium mb-4",
                          empate ? "text-amber-600" : "text-green-700"
                        )}
                      >
                        {empate
                          ? `Empate entre ${vencedoras
                              .map((o) => o.texto)
                              .join(", ")} (${maxVotos} votos cada)`
                          : `Vencedora: ${vencedoras[0].texto} (${maxVotos} voto${
                              maxVotos !== 1 ? "s" : ""
                            })`}
                      </p>
                    )}
                    {!r.encerrada && <div className="mb-4" />}

                    <div className="space-y-3">
                      {r.opcoes.map((opcao) => {
                        const pct =
                          r.total_votos > 0
                            ? Math.round((opcao.votos / r.total_votos) * 100)
                            : 0;
                        const isVencedora =
                          r.encerrada &&
                          !empate &&
                          opcao.votos === maxVotos &&
                          maxVotos > 0;
                        const aberta = opcaoAberta === opcao.id;
                        const temVotantes =
                          !!opcao.votantes && opcao.votantes.length > 0;
                        return (
                          <div key={opcao.id}>
                            <div className="flex justify-between text-sm mb-1">
                              <span
                                className={clsx(
                                  "font-medium",
                                  isVencedora && "text-green-700"
                                )}
                              >
                                {isVencedora && "★ "}
                                {opcao.texto}
                              </span>
                              <span className="text-gray-500">
                                {opcao.votos} voto{opcao.votos !== 1 ? "s" : ""} (
                                {pct}%)
                              </span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={clsx(
                                  "h-full rounded-full transition-all duration-500",
                                  isVencedora ? "bg-green-500" : "bg-primary-500"
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {temVotantes && (
                              <button
                                onClick={() =>
                                  setOpcaoAberta(aberta ? "" : opcao.id)
                                }
                                className="mt-1 text-xs text-primary-600 hover:underline print:hidden"
                              >
                                {aberta ? "ocultar" : "ver quem votou"}
                              </button>
                            )}
                            {aberta && temVotantes && (
                              <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
                                {opcao.votantes!.map((vt, i) => (
                                  <li key={i} className="flex justify-between gap-2">
                                    <span className="truncate">{vt.nome}</span>
                                    <span className="text-gray-400 shrink-0">
                                      {vt.bloco ? `${vt.bloco} / ` : ""}
                                      {vt.apartamento}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
          <h1 className="text-2xl font-bold">Relatórios da assembleia</h1>
          <p className="mt-1 mb-4 text-sm text-gray-500">
            Três documentos prontos para imprimir, assinar e arquivar. Todos em PDF.
          </p>
          <div className="mb-5">
            <SeletorAssembleia />
          </div>

          {!selected && (
            <div className="card text-center py-8">
              <p className="text-gray-500">
                Escolha a assembleia acima para baixar os relatórios.
              </p>
            </div>
          )}

          {selected && (
            <div className="grid gap-4 md:grid-cols-3">
              {RELATORIOS.map((r) => (
                <div
                  key={r.tipo}
                  className="flex flex-col rounded-2xl border-2 border-gray-300 bg-white p-5 shadow-md transition hover:shadow-lg"
                >
                  <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl ${r.fundo}`}>
                    <r.icone className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">{r.titulo}</h2>
                  <p className="mt-1 text-sm text-gray-600">{r.descricao}</p>
                  <ul className="mt-3 mb-5 flex-1 space-y-1.5">
                    {r.itens.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-gray-600">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => baixarRelatorio(r.tipo)}
                    disabled={!!exporting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 transition hover:bg-green-700 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4 text-white" />
                    {exporting === r.tipo ? "Gerando PDF..." : "Baixar em PDF"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

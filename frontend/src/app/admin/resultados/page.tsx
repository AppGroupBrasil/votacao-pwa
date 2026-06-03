"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Clock, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import type {
  AssembleiaListItem,
  Resultado,
  ProcuracaoPendente,
} from "@/lib/types";

export default function ResultadosPage() {
  const [assembleias, setAssembleias] = useState<AssembleiaListItem[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [pendentes, setPendentes] = useState<ProcuracaoPendente[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const carregarPendentes = useCallback((id: string) => {
    api
      .getProcuracoesPendentes(id)
      .then((d) => setPendentes(d.unidades))
      .catch(() => setPendentes([]));
  }, []);

  async function validar(eleitorId: string, acao: "aprovar" | "rejeitar") {
    await api.validarProcuracao(selected, eleitorId, acao);
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
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
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

  useEffect(() => {
    api.getAssembleias().then((d) => {
      const items = d.results || d;
      setAssembleias(items);
      const aberta = items.find((a: AssembleiaListItem) => a.status === "aberta");
      if (aberta) setSelected(aberta.id);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api
      .getResultados(selected)
      .then(setResultados)
      .finally(() => setLoading(false));
    carregarPendentes(selected);
  }, [selected, carregarPendentes]);

  // Auto-refresh every 5 seconds when assembly is open
  useEffect(() => {
    if (!selected) return;
    const current = assembleias.find((a) => a.id === selected);
    if (current?.status !== "aberta") return;

    const interval = setInterval(() => {
      api.getResultados(selected).then(setResultados);
    }, 5000);

    return () => clearInterval(interval);
  }, [selected, assembleias]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Resultados</h1>

      <div className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="input-field w-80"
          >
            <option value="">Selecione uma assembleia...</option>
            {assembleias.map((a) => (
              <option key={a.id} value={a.id}>
                {a.titulo} ({a.status})
              </option>
            ))}
          </select>

          <button
            onClick={exportarRelatorioDetalhado}
            disabled={!selected || exporting}
            className="btn-secondary inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Gerando relatório..." : "Exportar Relatório Detalhado"}
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          O relatório detalhado inclui nome, bloco, apartamento, perfil, IP, autenticação, data/hora e aparelho inferido pelo navegador no momento do voto.
        </p>
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
                key={p.eleitor_id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {p.bloco ? `${p.bloco} / ` : ""}
                    {p.apartamento} — {p.nome}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.procurador_nome
                      ? `Procurador: ${p.procurador_nome} · `
                      : ""}
                    {p.votos.length} voto{p.votos.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => validar(p.eleitor_id, "aprovar")}
                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" /> Aprovar
                  </button>
                  <button
                    onClick={() => validar(p.eleitor_id, "rejeitar")}
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

      {loading && <p className="text-gray-500">Carregando resultados...</p>}

      {!loading && resultados.length > 0 && (
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
                          {opcao.votos} voto{opcao.votos !== 1 ? "s" : ""} ({pct}
                          %)
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

      {!loading && selected && resultados.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-500">Nenhum voto registrado ainda.</p>
        </div>
      )}
    </div>
  );
}

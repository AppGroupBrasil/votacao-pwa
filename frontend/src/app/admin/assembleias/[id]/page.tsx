"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Users,
  Plus,
  Trash2,
  Play,
  Square,
  Copy,
  CheckCircle,
  Pencil,
  X,
  Save,
  Image as ImageIcon,
  FileDown,
  ExternalLink,
  ClipboardList,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import type { Condominio } from "@/lib/types";
import { api } from "@/lib/api";
import type { Assembleia } from "@/lib/types";
import { clsx } from "clsx";

const statusConfig = {
  rascunho: { label: "Rascunho", class: "bg-gray-100 text-gray-700" },
  aberta: { label: "Aberta", class: "bg-green-100 text-green-700" },
  encerrada: { label: "Encerrada", class: "bg-red-100 text-red-700" },
};

export default function AssembleiaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddQuestao, setShowAddQuestao] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [editForm, setEditForm] = useState({
    titulo: "",
    descricao: "",
    condominio: "",
    data_inicio: "",
    data_fim: "",
    quorum_minimo: 50,
    primeira_chamada_50_mais_1: true,
    quorum_segunda_chamada: 33,
    segunda_chamada_qualquer_numero: false,
  });

  // Question form
  const [questaoForm, setQuestaoForm] = useState({
    titulo: "",
    descricao: "",
    opcoes: [
      { texto: "", ordem: 1, link_externo: "" },
      { texto: "", ordem: 2, link_externo: "" },
    ],
  });
  const [questaoImagens, setQuestaoImagens] = useState<(File | null)[]>([null, null]);
  const [questaoArquivos, setQuestaoArquivos] = useState<(File | null)[]>([null, null]);
  const [editingQuestaoId, setEditingQuestaoId] = useState<string | null>(null);
  const [editQuestaoForm, setEditQuestaoForm] = useState({
    titulo: "",
    descricao: "",
    opcoes: [{ texto: "", ordem: 1, link_externo: "" }],
  });
  const [editQuestaoImagens, setEditQuestaoImagens] = useState<(File | null)[]>([]);
  const [editQuestaoArquivos, setEditQuestaoArquivos] = useState<(File | null)[]>([]);

  const loadAssembleia = useCallback(() => {
    api
      .getAssembleia(id)
      .then(setAssembleia)
      .catch(() => router.push("/admin/assembleias"))
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    loadAssembleia();
  }, [loadAssembleia]);

  function startEditing() {
    if (!assembleia) return;
    setEditForm({
      titulo: assembleia.titulo,
      descricao: assembleia.descricao || "",
      condominio: assembleia.condominio,
      data_inicio: assembleia.data_inicio.slice(0, 16),
      data_fim: assembleia.data_fim.slice(0, 16),
      quorum_minimo: assembleia.quorum_minimo,
      primeira_chamada_50_mais_1: assembleia.primeira_chamada_50_mais_1,
      quorum_segunda_chamada: assembleia.quorum_segunda_chamada,
      segunda_chamada_qualquer_numero: assembleia.segunda_chamada_qualquer_numero,
    });
    api.getCondominios().then((data) => setCondominios(data.results || data));
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const updated = await api.updateAssembleia(id, {
        ...editForm,
        data_inicio: new Date(editForm.data_inicio).toISOString(),
        data_fim: new Date(editForm.data_fim).toISOString(),
      });
      setAssembleia(updated);
      setEditing(false);
    } catch {
      alert("Erro ao salvar alterações.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir esta assembleia? Esta ação não pode ser desfeita.")) return;
    setActionLoading(true);
    try {
      await api.deleteAssembleia(id);
      router.push("/admin/assembleias");
    } catch {
      alert("Erro ao excluir assembleia.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAbrir() {
    if (!confirm("Tem certeza que deseja abrir esta assembleia para votação?")) return;
    setActionLoading(true);
    try {
      const updated = await api.abrirAssembleia(id);
      setAssembleia(updated);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Erro ao abrir assembleia.";
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEncerrar() {
    if (!confirm("ATENÇÃO: Isso vai encerrar a votação IMEDIATAMENTE.\n\nNenhum morador poderá mais votar após esta ação.\n\nDeseja continuar?")) return;
    if (!confirm("Confirmar encerramento da assembleia?\n\nClique OK para encerrar agora.")) return;
    setActionLoading(true);
    try {
      const updated = await api.encerrarAssembleia(id);
      setAssembleia(updated);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Erro ao encerrar assembleia.";
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddQuestao(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      const validOpcoes = questaoForm.opcoes.filter((o) => o.texto.trim());
      await api.createQuestao(id, {
        titulo: questaoForm.titulo,
        descricao: questaoForm.descricao,
        ordem: (assembleia?.questoes.length || 0) + 1,
        opcoes: validOpcoes.map((o) => ({ texto: o.texto, ordem: o.ordem, link_externo: o.link_externo })),
        opcaoImagens: questaoImagens,
        opcaoArquivos: questaoArquivos,
      });
      setQuestaoForm({
        titulo: "",
        descricao: "",
        opcoes: [
          { texto: "", ordem: 1, link_externo: "" },
          { texto: "", ordem: 2, link_externo: "" },
        ],
      });
      setQuestaoImagens([null, null]);
      setQuestaoArquivos([null, null]);
      setShowAddQuestao(false);
      loadAssembleia();
    } catch {
      alert("Erro ao adicionar questão.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteQuestao(questaoId: string) {
    if (!confirm("Remover esta questão?")) return;
    try {
      await api.deleteQuestao(id, questaoId);
      loadAssembleia();
    } catch {
      alert("Erro ao remover questão.");
    }
  }

  function startEditQuestao(q: Assembleia["questoes"][0]) {
    setEditingQuestaoId(q.id);
    setEditQuestaoForm({
      titulo: q.titulo,
      descricao: q.descricao || "",
      opcoes: q.opcoes.map((o) => ({ texto: o.texto, ordem: o.ordem, link_externo: o.link_externo || "" })),
    });
    setEditQuestaoImagens(q.opcoes.map(() => null));
    setEditQuestaoArquivos(q.opcoes.map(() => null));
  }

  async function handleSaveQuestao(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestaoId) return;
    setActionLoading(true);
    try {
      const validOpcoes = editQuestaoForm.opcoes.filter((o) => o.texto.trim());
      await api.updateQuestao(id, editingQuestaoId, {
        titulo: editQuestaoForm.titulo,
        descricao: editQuestaoForm.descricao,
        opcoes: validOpcoes.map((o) => ({ texto: o.texto, ordem: o.ordem, link_externo: o.link_externo })),
        opcaoImagens: editQuestaoImagens,
        opcaoArquivos: editQuestaoArquivos,
      });
      setEditingQuestaoId(null);
      loadAssembleia();
    } catch {
      alert("Erro ao salvar questão.");
    } finally {
      setActionLoading(false);
    }
  }

  function addEditOpcao() {
    setEditQuestaoForm({
      ...editQuestaoForm,
      opcoes: [
        ...editQuestaoForm.opcoes,
        { texto: "", ordem: editQuestaoForm.opcoes.length + 1, link_externo: "" },
      ],
    });
    setEditQuestaoImagens([...editQuestaoImagens, null]);
    setEditQuestaoArquivos([...editQuestaoArquivos, null]);
  }

  function removeEditOpcao(index: number) {
    if (editQuestaoForm.opcoes.length <= 2) return;
    setEditQuestaoForm({
      ...editQuestaoForm,
      opcoes: editQuestaoForm.opcoes
        .filter((_, i) => i !== index)
        .map((o, i) => ({ ...o, ordem: i + 1 })),
    });
    setEditQuestaoImagens(editQuestaoImagens.filter((_, i) => i !== index));
    setEditQuestaoArquivos(editQuestaoArquivos.filter((_, i) => i !== index));
  }

  function addOpcao() {
    setQuestaoForm({
      ...questaoForm,
      opcoes: [
        ...questaoForm.opcoes,
        { texto: "", ordem: questaoForm.opcoes.length + 1, link_externo: "" },
      ],
    });
    setQuestaoImagens([...questaoImagens, null]);
    setQuestaoArquivos([...questaoArquivos, null]);
  }

  function removeOpcao(index: number) {
    if (questaoForm.opcoes.length <= 2) return;
    setQuestaoForm({
      ...questaoForm,
      opcoes: questaoForm.opcoes
        .filter((_, i) => i !== index)
        .map((o, i) => ({ ...o, ordem: i + 1 })),
    });
    setQuestaoImagens(questaoImagens.filter((_, i) => i !== index));
    setQuestaoArquivos(questaoArquivos.filter((_, i) => i !== index));
  }

  function updateOpcao(index: number, texto: string) {
    const opcoes = [...questaoForm.opcoes];
    opcoes[index] = { ...opcoes[index], texto };
    setQuestaoForm({ ...questaoForm, opcoes });
  }

  function copyVotingLink() {
    const url = `${window.location.origin}/votacao/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (!assembleia) return null;

  const st = statusConfig[assembleia.status];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/assembleias"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold">{assembleia.titulo}</h1>
              <span
                className={clsx(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  st.class
                )}
              >
                {st.label}
              </span>
            </div>
            <p className="text-gray-500 text-sm">{assembleia.condominio_nome}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {assembleia.status === "rascunho" && (
              <>
                <button
                  onClick={startEditing}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Pencil className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={handleAbrir}
                  disabled={actionLoading}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Play className="w-4 h-4" />
                  Abrir Votação
                </button>
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors"
                  title="Excluir assembleia"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            {assembleia.status === "aberta" && (
              <>
                <button
                  onClick={copyVotingLink}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? "Copiado!" : "Link de Votação"}
                </button>
                <button
                  onClick={handleEncerrar}
                  disabled={actionLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
                >
                  <Square className="w-4 h-4" />
                  Encerrar
                </button>
              </>
            )}
            {assembleia.status === "encerrada" && (
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 text-sm"
                title="Excluir assembleia"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <form onSubmit={handleSaveEdit} className="card mb-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Editar Assembleia</h2>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condomínio</label>
            <select
              value={editForm.condominio}
              onChange={(e) => setEditForm({ ...editForm, condominio: e.target.value })}
              className="input-field"
              required
            >
              <option value="">Selecione...</option>
              {condominios.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input
              type="text"
              value={editForm.titulo}
              onChange={(e) => setEditForm({ ...editForm, titulo: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={editForm.descricao}
              onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
              className="input-field"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Início</label>
              <input
                type="datetime-local"
                value={editForm.data_inicio}
                onChange={(e) => setEditForm({ ...editForm, data_inicio: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fim</label>
              <input
                type="datetime-local"
                value={editForm.data_fim}
                onChange={(e) => setEditForm({ ...editForm, data_fim: e.target.value })}
                className="input-field"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quórum Mínimo — 1ª Chamada</label>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={editForm.primeira_chamada_50_mais_1}
                  onChange={(e) => setEditForm({ ...editForm, primeira_chamada_50_mais_1: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">50% + 1 (conforme lei)</span>
              </label>
              {!editForm.primeira_chamada_50_mais_1 && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editForm.quorum_minimo}
                  onChange={(e) => setEditForm({ ...editForm, quorum_minimo: Number(e.target.value) })}
                  className="input-field w-32"
                  required
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quórum Mínimo — 2ª Chamada</label>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={editForm.segunda_chamada_qualquer_numero}
                  onChange={(e) => setEditForm({ ...editForm, segunda_chamada_qualquer_numero: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">Qualquer número dos presentes</span>
              </label>
              {!editForm.segunda_chamada_qualquer_numero && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editForm.quorum_segunda_chamada}
                  onChange={(e) => setEditForm({ ...editForm, quorum_segunda_chamada: Number(e.target.value) })}
                  className="input-field w-32"
                  required
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {actionLoading ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="card text-center py-3">
          <Calendar className="w-5 h-5 mx-auto mb-1 text-gray-400" />
          <p className="text-xs text-gray-500">Início</p>
          <p className="text-sm font-medium">
            {new Date(assembleia.data_inicio).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="card text-center py-3">
          <Calendar className="w-5 h-5 mx-auto mb-1 text-gray-400" />
          <p className="text-xs text-gray-500">Fim</p>
          <p className="text-sm font-medium">
            {new Date(assembleia.data_fim).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="card text-center py-3">
          <Users className="w-5 h-5 mx-auto mb-1 text-gray-400" />
          <p className="text-xs text-gray-500">Votantes</p>
          <p className="text-sm font-medium">{assembleia.total_votantes}</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-lg font-bold text-primary-600">
            {assembleia.primeira_chamada_50_mais_1
              ? "50% + 1"
              : `${assembleia.quorum_minimo}%`}
          </p>
          <p className="text-xs text-gray-500">Quórum 1ª Chamada</p>
        </div>
        <div className="card text-center py-3">
          <p className="text-lg font-bold text-orange-600">
            {assembleia.segunda_chamada_qualquer_numero
              ? "Qualquer nº"
              : `${assembleia.quorum_segunda_chamada}% + 1`}
          </p>
          <p className="text-xs text-gray-500">Quórum 2ª Chamada</p>
        </div>
      </div>

      {assembleia.descricao && (
        <div className="card mb-6">
          <p className="text-sm text-gray-600">{assembleia.descricao}</p>
        </div>
      )}

      {/* Lista de Presença */}
      {assembleia.status !== "rascunho" && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-gray-400" />
              Lista de Presença ({assembleia.total_presentes})
            </h2>
            <div className="flex items-center gap-4">
              <Link
                href={`/admin/assembleias/${assembleia.id}/controle`}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
              >
                <ListChecks className="w-4 h-4" /> Controle de votação
              </Link>
              <Link
                href={`/admin/assembleias/${assembleia.id}/auditoria`}
                className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
              >
                <ShieldCheck className="w-4 h-4" /> Trilha de auditoria
              </Link>
            </div>
          </div>
          {assembleia.presencas.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">Nenhum morador se autenticou ainda.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Nome</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Bloco</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Apto</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Perfil</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Horário</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Assinatura Facial</th>
                  </tr>
                </thead>
                <tbody>
                  {assembleia.presencas.map((p, i) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{p.nome}</td>
                      <td className="px-4 py-2">{p.bloco || "—"}</td>
                      <td className="px-4 py-2">{p.apartamento}</td>
                      <td className="px-4 py-2">
                        <span className={clsx(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          p.perfil === "proprietario"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {p.perfil === "proprietario" ? "Proprietário" : "Procurador"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {new Date(p.horario_entrada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2">
                        {p.assinatura_facial ? (
                          <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono" title={p.assinatura_facial}>
                            {p.assinatura_facial.slice(0, 16)}…
                          </code>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Questions Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Questões ({assembleia.questoes.length})
          </h2>
          {assembleia.status === "rascunho" && (
            <button
              onClick={() => setShowAddQuestao(!showAddQuestao)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar Questão
            </button>
          )}
        </div>

        {/* Add Question Form */}
        {showAddQuestao && (
          <form onSubmit={handleAddQuestao} className="card mb-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título da Questão
              </label>
              <input
                type="text"
                value={questaoForm.titulo}
                onChange={(e) =>
                  setQuestaoForm({ ...questaoForm, titulo: e.target.value })
                }
                className="input-field"
                required
                placeholder="Ex: Aprovação do orçamento 2026"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição (opcional)
              </label>
              <textarea
                value={questaoForm.descricao}
                onChange={(e) =>
                  setQuestaoForm({ ...questaoForm, descricao: e.target.value })
                }
                className="input-field"
                rows={2}
                placeholder="Detalhes sobre esta questão..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opções de Voto
              </label>
              <div className="space-y-4">
                {questaoForm.opcoes.map((opcao, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 w-5">{i + 1}.</span>
                      <input
                        type="text"
                        value={opcao.texto}
                        onChange={(e) => updateOpcao(i, e.target.value)}
                        className="input-field flex-1"
                        required
                        placeholder={`Opção ${i + 1}`}
                      />
                      {questaoForm.opcoes.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOpcao(i)}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {/* Anexos da opção */}
                    <div className="ml-7 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <ImageIcon className="w-3 h-3" /> Foto
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const arr = [...questaoImagens];
                            arr[i] = e.target.files?.[0] || null;
                            setQuestaoImagens(arr);
                          }}
                          className="input-field text-xs"
                        />
                        {questaoImagens[i] && <p className="text-xs text-green-600 mt-1">✓ {questaoImagens[i]!.name}</p>}
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <FileDown className="w-3 h-3" /> Arquivo
                        </label>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                          onChange={(e) => {
                            const arr = [...questaoArquivos];
                            arr[i] = e.target.files?.[0] || null;
                            setQuestaoArquivos(arr);
                          }}
                          className="input-field text-xs"
                        />
                        {questaoArquivos[i] && <p className="text-xs text-green-600 mt-1">✓ {questaoArquivos[i]!.name}</p>}
                      </div>
                      <div>
                        <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <ExternalLink className="w-3 h-3" /> Link
                        </label>
                        <input
                          type="url"
                          value={opcao.link_externo}
                          onChange={(e) => {
                            const opcoes = [...questaoForm.opcoes];
                            opcoes[i] = { ...opcoes[i], link_externo: e.target.value };
                            setQuestaoForm({ ...questaoForm, opcoes });
                          }}
                          className="input-field text-xs"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addOpcao}
                className="text-sm text-primary-600 hover:text-primary-700 mt-2"
              >
                + Adicionar opção
              </button>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-primary text-sm"
              >
                {actionLoading ? "Salvando..." : "Salvar Questão"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddQuestao(false)}
                className="btn-secondary text-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Questions List */}
        {assembleia.questoes.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500 mb-2">Nenhuma questão adicionada.</p>
            {assembleia.status === "rascunho" && (
              <p className="text-sm text-gray-400">
                Adicione questões antes de abrir a votação.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {assembleia.questoes.map((q, index) => (
              <div key={q.id} className="card">
                {editingQuestaoId === q.id ? (
                  /* Inline Edit Form */
                  <form onSubmit={handleSaveQuestao} className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-sm text-gray-500">Editando questão {index + 1}</h3>
                      <button type="button" onClick={() => setEditingQuestaoId(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                      <input
                        type="text"
                        value={editQuestaoForm.titulo}
                        onChange={(e) => setEditQuestaoForm({ ...editQuestaoForm, titulo: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                      <textarea
                        value={editQuestaoForm.descricao}
                        onChange={(e) => setEditQuestaoForm({ ...editQuestaoForm, descricao: e.target.value })}
                        className="input-field"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Opções de Voto</label>
                      <div className="space-y-4">
                        {editQuestaoForm.opcoes.map((opcao, i) => (
                          <div key={i} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-400 w-5">{i + 1}.</span>
                              <input
                                type="text"
                                value={opcao.texto}
                                onChange={(e) => {
                                  const opcoes = [...editQuestaoForm.opcoes];
                                  opcoes[i] = { ...opcoes[i], texto: e.target.value };
                                  setEditQuestaoForm({ ...editQuestaoForm, opcoes });
                                }}
                                className="input-field flex-1"
                                required
                              />
                              {editQuestaoForm.opcoes.length > 2 && (
                                <button type="button" onClick={() => removeEditOpcao(i)} className="text-red-400 hover:text-red-600 p-1">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                            {/* Anexos da opção */}
                            <div className="ml-7 grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                  <ImageIcon className="w-3 h-3" /> Foto
                                  {q.opcoes[i]?.imagem_url && <span className="text-green-600 ml-1">(atual)</span>}
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const arr = [...editQuestaoImagens];
                                    arr[i] = e.target.files?.[0] || null;
                                    setEditQuestaoImagens(arr);
                                  }}
                                  className="input-field text-xs"
                                />
                                {editQuestaoImagens[i] && <p className="text-xs text-green-600 mt-1">✓ {editQuestaoImagens[i]!.name}</p>}
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                  <FileDown className="w-3 h-3" /> Arquivo
                                  {q.opcoes[i]?.arquivo_url && <span className="text-green-600 ml-1">(atual)</span>}
                                </label>
                                <input
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                                  onChange={(e) => {
                                    const arr = [...editQuestaoArquivos];
                                    arr[i] = e.target.files?.[0] || null;
                                    setEditQuestaoArquivos(arr);
                                  }}
                                  className="input-field text-xs"
                                />
                                {editQuestaoArquivos[i] && <p className="text-xs text-green-600 mt-1">✓ {editQuestaoArquivos[i]!.name}</p>}
                              </div>
                              <div>
                                <label className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                  <ExternalLink className="w-3 h-3" /> Link
                                </label>
                                <input
                                  type="url"
                                  value={opcao.link_externo}
                                  onChange={(e) => {
                                    const opcoes = [...editQuestaoForm.opcoes];
                                    opcoes[i] = { ...opcoes[i], link_externo: e.target.value };
                                    setEditQuestaoForm({ ...editQuestaoForm, opcoes });
                                  }}
                                  className="input-field text-xs"
                                  placeholder="https://..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={addEditOpcao} className="text-sm text-primary-600 hover:text-primary-700 mt-2">
                        + Adicionar opção
                      </button>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button type="submit" disabled={actionLoading} className="btn-primary flex items-center gap-2 text-sm">
                        <Save className="w-4 h-4" />
                        {actionLoading ? "Salvando..." : "Salvar"}
                      </button>
                      <button type="button" onClick={() => setEditingQuestaoId(null)} className="btn-secondary text-sm">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Question Display */
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">
                        {index + 1}. {q.titulo}
                      </h3>
                      {q.descricao && (
                        <p className="text-sm text-gray-500 mt-1">
                          {q.descricao}
                        </p>
                      )}

                      <div className="mt-2 space-y-1">
                        {q.opcoes.map((o) => (
                          <div key={o.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {o.texto}
                            </span>
                            {o.imagem_url && (
                              <a href={o.imagem_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <ImageIcon className="w-3 h-3" /> Foto
                              </a>
                            )}
                            {o.arquivo_url && (
                              <a href={o.arquivo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <FileDown className="w-3 h-3" /> Arquivo
                              </a>
                            )}
                            {o.link_externo && (
                              <a href={o.link_externo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <ExternalLink className="w-3 h-3" /> Link
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {assembleia.status === "rascunho" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEditQuestao(q)}
                          className="text-gray-400 hover:text-primary-600 p-1"
                          title="Editar questão"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestao(q.id)}
                          className="text-gray-400 hover:text-red-600 p-1"
                          title="Excluir questão"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voting Link */}
      {assembleia.status === "aberta" && (
        <div className="card bg-green-50 border border-green-200">
          <p className="text-sm font-medium text-green-800 mb-2">
            Link de votação para os moradores:
          </p>
          <div className="flex items-center gap-2">
            <code className="text-sm bg-white px-3 py-1.5 rounded border border-green-200 flex-1 truncate">
              {typeof window !== "undefined"
                ? `${window.location.origin}/votacao/${id}`
                : `/votacao/${id}`}
            </code>
            <button
              onClick={copyVotingLink}
              className="text-green-700 hover:text-green-800 p-1.5"
            >
              {copied ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

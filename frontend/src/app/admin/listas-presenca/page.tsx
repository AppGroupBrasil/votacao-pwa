"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import {
  Plus,
  X,
  Trash2,
  Link as LinkIcon,
  Check,
  Power,
  Eye,
  Users,
  ClipboardList,
} from "lucide-react";
import { api } from "@/lib/api";
import ComoFunciona from "@/components/ComoFunciona";
import type { ListaPresenca } from "@/lib/types";

export default function ListasPresencaPage() {
  const [listas, setListas] = useState<ListaPresenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [nomeCondominio, setNomeCondominio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string>("");

  function carregar() {
    setLoading(true);
    api
      .getListasPresenca()
      .then((d) => setListas(d.results || (d as any)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirModal() {
    // Reaproveita o nome do condomínio de uma lista já criada, se houver.
    const anterior = listas.find((l) => l.condominio_nome)?.condominio_nome;
    if (anterior) setNomeCondominio(anterior);
    setModalOpen(true);
  }

  async function salvar() {
    if (!titulo.trim()) return;
    if (!nomeCondominio.trim()) {
      alert("Informe o nome do condomínio.");
      return;
    }
    setSalvando(true);
    try {
      await api.createListaPresenca(titulo.trim(), nomeCondominio.trim());
      setTitulo("");
      setModalOpen(false);
      carregar();
    } catch {
      alert(
        "Não foi possível criar a lista agora. Tente novamente em instantes."
      );
    } finally {
      setSalvando(false);
    }
  }

  function linkPublico(lista: ListaPresenca) {
    if (typeof window === "undefined") return "";
    if (lista.codigo_curto) {
      return `${window.location.origin}/v/${lista.codigo_curto}`;
    }
    return `${window.location.origin}/presenca-manual/${lista.id}`;
  }

  async function copiarLink(lista: ListaPresenca) {
    try {
      await navigator.clipboard.writeText(linkPublico(lista));
      setCopiado(lista.id);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* ignore */
    }
  }

  async function alternarAtiva(l: ListaPresenca) {
    await api.updateListaPresenca(l.id, { ativa: !l.ativa });
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta lista e todos os registros de presença?")) return;
    await api.deleteListaPresenca(id);
    carregar();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-indigo-600" /> Lista de
              presença
            </h1>
            <ComoFunciona tutorial="presenca-manual" />
          </div>
          <p className="text-sm text-gray-500">
            Gere um link para os presentes registrarem presença pelo celular:
            selfie, nome, bloco, apartamento e assinatura na tela. Sem cadastro
            prévio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <NextLink
            href="/admin/listas-presenca/exemplo"
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Eye className="w-4 h-4" /> Ver exemplo da lista
          </NextLink>
          <button
            onClick={() => {
              setTitulo("");
              abrirModal();
            }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nova lista
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && listas.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-gray-500">Nenhuma lista de presença criada ainda.</p>
        </div>
      )}

      <div className="space-y-4">
        {listas.map((l) => (
          <div key={l.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-lg">{l.titulo}</h3>
                <p className="text-sm text-gray-500">
                  {l.total_registros} presença
                  {l.total_registros !== 1 ? "s" : ""} ·{" "}
                  {l.ativa ? (
                    <span className="text-green-600">aberta</span>
                  ) : (
                    <span className="text-gray-400">encerrada</span>
                  )}
                </p>
              </div>
              <NextLink
                href={`/admin/listas-presenca/${l.id}`}
                className="btn-secondary inline-flex items-center gap-1 text-sm shrink-0"
              >
                <Users className="w-4 h-4" /> Ver presenças
              </NextLink>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => copiarLink(l)}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
              >
                {copiado === l.id ? (
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
                href={linkPublico(l)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
              >
                <Eye className="w-4 h-4" /> Ver como morador
              </a>
              <button
                onClick={() => alternarAtiva(l)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Power className="w-4 h-4" /> {l.ativa ? "Encerrar" : "Reabrir"}
              </button>
              <button
                onClick={() => excluir(l.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova lista de presença</h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <label className="block text-sm font-medium mb-1">
              Nome do condomínio
            </label>
            <input
              value={nomeCondominio}
              onChange={(e) => setNomeCondominio(e.target.value)}
              placeholder="Ex.: Edifício Vendeiros"
              className="input-field w-full mb-1"
            />
            <p className="text-xs text-gray-500 mb-4">
              Aparece na lista e vincula o reconhecimento facial dos moradores
              deste condomínio.
            </p>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Assembleia ordinária 06/2026"
              className="input-field w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="btn-primary disabled:opacity-50"
              >
                {salvando ? "Criando..." : "Criar e gerar link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

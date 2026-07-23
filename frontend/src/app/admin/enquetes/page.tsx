"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import {
  Plus,
  X,
  Trash2,
  Link as LinkIcon,
  Check,
  BarChart3,
  Power,
  Lock,
  Eye,
  ClipboardList,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import ComoFunciona from "@/components/ComoFunciona";
import type { Enquete, ListaPresenca } from "@/lib/types";

export default function EnquetesPage() {
  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  const [votoAberto, setVotoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState<string>("");

  const [listas, setListas] = useState<ListaPresenca[]>([]);
  const [listaModalOpen, setListaModalOpen] = useState(false);
  const [listaTitulo, setListaTitulo] = useState("");
  const [salvandoLista, setSalvandoLista] = useState(false);

  function carregar() {
    setLoading(true);
    api
      .getEnquetes()
      .then((d) => setEnquetes(d.results || (d as any)))
      .finally(() => setLoading(false));
  }

  function carregarListas() {
    api
      .getListasPresenca()
      .then((d) => setListas(d.results || (d as any)))
      .catch(() => {});
  }

  useEffect(() => {
    carregar();
    carregarListas();
  }, []);

  async function salvarLista() {
    if (!listaTitulo.trim()) return;
    setSalvandoLista(true);
    try {
      await api.createListaPresenca(listaTitulo.trim());
      setListaTitulo("");
      setListaModalOpen(false);
      carregarListas();
    } finally {
      setSalvandoLista(false);
    }
  }

  function linkListaPublico(lista: ListaPresenca) {
    if (typeof window === "undefined") return "";
    if (lista.codigo_curto) {
      return `${window.location.origin}/v/${lista.codigo_curto}`;
    }
    return `${window.location.origin}/presenca-manual/${lista.id}`;
  }

  async function copiarLinkLista(lista: ListaPresenca) {
    try {
      await navigator.clipboard.writeText(linkListaPublico(lista));
      setCopiado(`lista-${lista.id}`);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* ignore */
    }
  }

  async function alternarListaAtiva(l: ListaPresenca) {
    await api.updateListaPresenca(l.id, { ativa: !l.ativa });
    carregarListas();
  }

  async function excluirLista(id: string) {
    if (!confirm("Excluir esta lista e todos os registros de presença?")) return;
    await api.deleteListaPresenca(id);
    carregarListas();
  }

  function abrirModal() {
    setTitulo("");
    setOpcoes(["", ""]);
    setVotoAberto(false);
    setErro("");
    setModalOpen(true);
  }

  function setOpcao(i: number, v: string) {
    setOpcoes((o) => o.map((x, idx) => (idx === i ? v : x)));
  }

  async function salvar() {
    setErro("");
    const limpo = opcoes.map((o) => o.trim()).filter(Boolean);
    if (!titulo.trim()) {
      setErro("Informe a pergunta.");
      return;
    }
    if (limpo.length < 2) {
      setErro("Informe pelo menos duas respostas.");
      return;
    }
    setSalvando(true);
    try {
      await api.createEnquete(titulo.trim(), limpo, { voto_aberto: votoAberto });
      setModalOpen(false);
      carregar();
    } catch {
      setErro("Erro ao criar a votação.");
    } finally {
      setSalvando(false);
    }
  }

  function linkPublico(e: Enquete) {
    if (typeof window === "undefined") return "";
    return e.codigo_curto
      ? `${window.location.origin}/v/${e.codigo_curto}`
      : `${window.location.origin}/enquete/${e.id}`;
  }

  async function copiarLink(e: Enquete) {
    try {
      await navigator.clipboard.writeText(linkPublico(e));
      setCopiado(e.id);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* ignore */
    }
  }

  async function alternarAtiva(e: Enquete) {
    await api.updateEnquete(e.id, { ativa: !e.ativa });
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta votação e todos os votos?")) return;
    await api.deleteEnquete(id);
    carregar();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Enquete rápida</h1>
            <ComoFunciona tutorial="enquete" />
          </div>
          <p className="text-sm text-gray-500">
            Gere um link e compartilhe. Voto secreto (anônimo) ou aberto
            (identifica quem votou).
          </p>
        </div>
        <button
          onClick={abrirModal}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nova Votação
        </button>
      </div>

      {loading && <p className="text-gray-500">Carregando...</p>}

      {!loading && enquetes.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-gray-500">Nenhuma votação criada ainda.</p>
        </div>
      )}

      <div className="space-y-4">
        {enquetes.map((e) => (
          <div key={e.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg">{e.titulo}</h3>
                  {e.voto_aberto ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                      <Eye className="w-3 h-3" /> Aberta
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                      <Lock className="w-3 h-3" /> Secreta
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {e.opcoes.length} respostas · {e.total_votos} voto
                  {e.total_votos !== 1 ? "s" : ""} ·{" "}
                  {e.ativa ? (
                    <span className="text-green-600">aberta</span>
                  ) : (
                    <span className="text-gray-400">encerrada</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/enquete/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary inline-flex items-center gap-1 text-sm"
                >
                  <BarChart3 className="w-4 h-4" /> Resultado
                </a>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => copiarLink(e)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {copiado === e.id ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" /> Copiado!
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" /> Copiar link
                  </>
                )}
              </button>
              <button
                onClick={() => alternarAtiva(e)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Power className="w-4 h-4" /> {e.ativa ? "Encerrar" : "Reabrir"}
              </button>
              <button
                onClick={() => excluir(e.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
              <span className="text-xs text-gray-400 truncate">
                {linkPublico(e)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" /> Lista de
              presença manual
            </h2>
            <ComoFunciona tutorial="presenca-manual" />
          </div>
          <p className="text-sm text-gray-500">
            Gere um link para que os presentes registrem presença pelo celular:
            selfie, nome, bloco, apartamento e assinatura na tela.
          </p>
        </div>
        <button
          onClick={() => {
            setListaTitulo("");
            setListaModalOpen(true);
          }}
          className="btn-primary flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" /> Nova lista
        </button>
      </div>

      {listas.length === 0 && (
        <div className="card text-center py-8">
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
                onClick={() => copiarLinkLista(l)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {copiado === `lista-${l.id}` ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" /> Copiado!
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" /> Copiar link
                  </>
                )}
              </button>
              <button
                onClick={() => alternarListaAtiva(l)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Power className="w-4 h-4" /> {l.ativa ? "Encerrar" : "Reabrir"}
              </button>
              <button
                onClick={() => excluirLista(l.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
              <span className="text-xs text-gray-400 truncate">
                {linkListaPublico(l)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {listaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova lista de presença</h2>
              <button onClick={() => setListaModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              value={listaTitulo}
              onChange={(e) => setListaTitulo(e.target.value)}
              placeholder="Ex.: Assembleia ordinária 06/2026"
              className="input-field w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setListaModalOpen(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={salvarLista}
                disabled={salvandoLista}
                className="btn-primary disabled:opacity-50"
              >
                {salvandoLista ? "Criando..." : "Criar e gerar link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova Votação</h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <label className="block text-sm font-medium mb-1">Pergunta</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Qual cor para a fachada?"
              className="input-field w-full mb-4"
            />

            <label className="block text-sm font-medium mb-1">Respostas</label>
            <div className="space-y-2">
              {opcoes.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOpcao(i, e.target.value)}
                    placeholder={`Resposta ${i + 1}`}
                    className="input-field w-full"
                  />
                  {opcoes.length > 2 && (
                    <button
                      onClick={() =>
                        setOpcoes((ops) => ops.filter((_, idx) => idx !== i))
                      }
                      className="text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setOpcoes((o) => [...o, ""])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
            >
              <Plus className="w-4 h-4" /> Adicionar resposta
            </button>

            <label className="mt-5 block text-sm font-medium mb-2">
              Tipo de voto
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVotoAberto(false)}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left ${
                  !votoAberto
                    ? "border-primary-600 bg-primary-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Lock className="w-5 h-5 shrink-0 text-primary-600" />
                <span>
                  <span className="block text-sm font-medium">
                    Voto secreto
                  </span>
                  <span className="block text-xs text-gray-500">
                    Anônimo. Ninguém sabe quem votou em quê.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVotoAberto(true)}
                className={`flex items-start gap-2 rounded-lg border p-3 text-left ${
                  votoAberto
                    ? "border-primary-600 bg-primary-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Eye className="w-5 h-5 shrink-0 text-primary-600" />
                <span>
                  <span className="block text-sm font-medium">Voto aberto</span>
                  <span className="block text-xs text-gray-500">
                    Identifica quem votou em cada resposta.
                  </span>
                </span>
              </button>
            </div>

            {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

            <div className="mt-6 flex justify-end gap-2">
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

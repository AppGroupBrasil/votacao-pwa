"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Plus,
  X,
  Trash2,
  Link as LinkIcon,
  Check,
  Power,
  Eye,
  ExternalLink,
  Share2,
  Users,
  ClipboardList,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "@/lib/api";
import ComoFunciona from "@/components/ComoFunciona";
import type { ListaPresenca, Condominio } from "@/lib/types";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.replace(/\D/g, ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function ListasPresencaPage() {
  const [listas, setListas] = useState<ListaPresenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [nomeCondominio, setNomeCondominio] = useState("");
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [modoNovoCond, setModoNovoCond] = useState(false);
  const [modoPlanilha, setModoPlanilha] = useState(false);
  const [importandoPlanilha, setImportandoPlanilha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string>("");
  const router = useRouter();

  function carregar() {
    setLoading(true);
    api
      .getListasPresenca()
      .then((d) => setListas(d.results || (d as any)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
    api
      .getCondominios()
      .then((d) => setCondominios(d.results || (d as any)))
      .catch(() => {});
  }, []);

  function abrirModal() {
    setModoPlanilha(false);
    // Pré-seleciona o condomínio de uma lista já criada, se houver; senão o
    // primeiro da conta. Escolher da lista evita erro de digitação e garante
    // que a lista aponte para o MESMO condomínio dos eleitores importados.
    const anterior = listas.find((l) => l.condominio_nome)?.condominio_nome;
    if (anterior) {
      setNomeCondominio(anterior);
      setModoNovoCond(false);
    } else if (condominios.length > 0) {
      setNomeCondominio(condominios[0].nome);
      setModoNovoCond(false);
    } else {
      setNomeCondominio("");
      setModoNovoCond(true);
    }
    setModalOpen(true);
  }

  async function importarPlanilha(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!nomeCondominio.trim() || !titulo.trim()) {
      alert(
        "Informe o nome do condomínio e o título da reunião antes de escolher a planilha."
      );
      return;
    }
    setImportandoPlanilha(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
      });
      const norm = (r: Record<string, any>, ...keys: string[]) => {
        for (const k of Object.keys(r)) {
          if (keys.includes(k.trim().toLowerCase())) return String(r[k]).trim();
        }
        return "";
      };
      const eleitores = [];
      for (const r of rows) {
        const cpf = norm(r, "cpf");
        eleitores.push({
          nome: norm(r, "nome"),
          cpf_hash: cpf ? await sha256Hex(cpf) : "",
          bloco: norm(r, "bloco"),
          apartamento: norm(r, "apartamento", "apto", "ap"),
          email: norm(r, "email", "e-mail"),
        });
      }
      if (eleitores.length === 0) {
        alert("Planilha vazia ou sem dados válidos.");
        return;
      }
      const res = await api.importarPlanilhaCompleta(
        nomeCondominio.trim(),
        titulo.trim(),
        eleitores
      );
      setModalOpen(false);
      alert(
        `Pronto! ${res.criados} morador(es) importado(s)` +
          (res.pulados ? `, ${res.pulados} já existiam` : "") +
          `.\nCondomínio, lista de presença e votação foram criados. ` +
          `Agora é só adicionar as perguntas da votação.`
      );
      router.push(`/admin/assembleias/${res.assembleia_id}`);
    } catch {
      alert(
        "Não foi possível importar agora. Confira a planilha (colunas: nome, cpf, bloco, apartamento) e tente novamente."
      );
    } finally {
      setImportandoPlanilha(false);
    }
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

  async function compartilhar(lista: ListaPresenca) {
    const url = linkPublico(lista);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Lista de presença", url });
        return;
      } catch {
        /* usuário cancelou ou não suportado: cai no copiar */
      }
    }
    await copiarLink(lista);
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
                <ExternalLink className="w-4 h-4" /> Abrir lista de presença
              </a>
              <button
                onClick={() => compartilhar(l)}
                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
              >
                <Share2 className="w-4 h-4" /> Compartilhar
              </button>
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

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModoPlanilha(true)}
                className={`rounded-lg border p-3 text-left text-sm ${
                  modoPlanilha
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-400"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <FileSpreadsheet className="mb-1 h-5 w-5 text-indigo-600" />
                <span className="block font-semibold">Com planilha</span>
                <span className="block text-xs text-gray-500">
                  Cadastra moradores e já cria a votação
                </span>
              </button>
              <button
                type="button"
                onClick={() => setModoPlanilha(false)}
                className={`rounded-lg border p-3 text-left text-sm ${
                  !modoPlanilha
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-400"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <Users className="mb-1 h-5 w-5 text-indigo-600" />
                <span className="block font-semibold">Sem planilha</span>
                <span className="block text-xs text-gray-500">
                  Moradores se cadastram na hora
                </span>
              </button>
            </div>

            <label className="block text-sm font-medium mb-1">
              Condomínio
            </label>
            {condominios.length > 0 && !modoNovoCond ? (
              <select
                value={nomeCondominio}
                onChange={(e) => {
                  if (e.target.value === "__novo__") {
                    setModoNovoCond(true);
                    setNomeCondominio("");
                  } else {
                    setNomeCondominio(e.target.value);
                  }
                }}
                className="input-field w-full mb-1"
              >
                {condominios.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
                <option value="__novo__">+ Novo condomínio…</option>
              </select>
            ) : (
              <input
                value={nomeCondominio}
                onChange={(e) => setNomeCondominio(e.target.value)}
                placeholder="Ex.: San Residence"
                className="input-field w-full mb-1"
                autoFocus
              />
            )}
            <p className="text-xs text-gray-500 mb-4">
              {condominios.length > 0 && !modoNovoCond
                ? "Escolha o condomínio para vincular a lista aos eleitores e ao reconhecimento facial deste condomínio."
                : "Aparece na lista e vincula o reconhecimento facial dos moradores deste condomínio."}
            </p>
            <label className="block text-sm font-medium mb-1">
              {modoPlanilha ? "Título da reunião" : "Título"}
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Assembleia ordinária 06/2026"
              className="input-field w-full mb-4"
            />

            {modoPlanilha ? (
              <>
                <label className="block text-sm font-medium mb-1">
                  Planilha dos moradores
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={importarPlanilha}
                  disabled={importandoPlanilha}
                  className="input-field w-full mb-2 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mb-4">
                  Colunas aceitas: <b>nome</b>, <b>cpf</b>, <b>bloco</b>,{" "}
                  <b>apartamento</b> (e-mail opcional). Ao enviar, o sistema
                  cria o condomínio, cadastra os moradores, gera a lista de
                  presença e já prepara a votação vinculada. Depois é só
                  adicionar as pautas.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="btn-secondary"
                    disabled={importandoPlanilha}
                  >
                    Cancelar
                  </button>
                  {importandoPlanilha && (
                    <span className="inline-flex items-center text-sm text-gray-500">
                      Importando e preparando tudo…
                    </span>
                  )}
                </div>
              </>
            ) : (
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}

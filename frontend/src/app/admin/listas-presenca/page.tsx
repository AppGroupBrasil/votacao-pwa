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
  Video,
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

function normCol(r: Record<string, any>, ...keys: string[]) {
  for (const k of Object.keys(r)) {
    if (keys.includes(k.trim().toLowerCase())) return String(r[k]).trim();
  }
  return "";
}

async function lerLinhas(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
}

export default function ListasPresencaPage() {
  const [listas, setListas] = useState<ListaPresenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlanilhaOpen, setModalPlanilhaOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [nomeCondominio, setNomeCondominio] = useState("");
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [modoNovoCond, setModoNovoCond] = useState(false);
  const [arqMoradores, setArqMoradores] = useState<File | null>(null);
  const [arqInadimplentes, setArqInadimplentes] = useState<File | null>(null);
  const [importandoPlanilha, setImportandoPlanilha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string>("");
  // Sala de vídeo: link colado aqui, entregue ao morador só depois da presença.
  const [linkSala, setLinkSala] = useState("");
  const [modalSala, setModalSala] = useState<ListaPresenca | null>(null);
  const [salvandoSala, setSalvandoSala] = useState(false);
  const router = useRouter();

  function carregar() {
    setLoading(true);
    api
      // As listas rápidas moram na tela de Votação rápida.
      .getListasPresenca({ rapido: false })
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

  // Pré-seleciona o condomínio de uma lista já criada, se houver; senão o
  // primeiro da conta. Escolher da lista evita erro de digitação e garante
  // que a lista aponte para o MESMO condomínio dos eleitores importados.
  function preselecionarCondominio() {
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
  }

  // Quem cola o link costuma colar "meet.google.com/..." sem o https://, e o
  // servidor recusa a URL. Completamos aqui para o síndico não travar.
  function comEsquema(valor: string) {
    const v = valor.trim();
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  function abrirModal() {
    setTitulo("");
    setLinkSala("");
    preselecionarCondominio();
    setModalOpen(true);
  }

  function abrirModalSala(l: ListaPresenca) {
    setLinkSala(l.link_reuniao || "");
    setModalSala(l);
  }

  async function salvarSala() {
    if (!modalSala) return;
    setSalvandoSala(true);
    try {
      const atualizada = await api.updateListaPresenca(modalSala.id, {
        link_reuniao: comEsquema(linkSala),
      });
      setListas((ls) =>
        ls.map((l) => (l.id === atualizada.id ? { ...l, ...atualizada } : l))
      );
      setModalSala(null);
    } catch (e: any) {
      const erro = e?.response?.data?.link_reuniao;
      alert(
        Array.isArray(erro)
          ? `Link da sala: ${erro[0]}`
          : "Não foi possível salvar o link agora. Tente novamente."
      );
    } finally {
      setSalvandoSala(false);
    }
  }

  function abrirModalPlanilha() {
    setTitulo("");
    setArqMoradores(null);
    setArqInadimplentes(null);
    preselecionarCondominio();
    setModalPlanilhaOpen(true);
  }

  async function importarComPlanilha() {
    if (!nomeCondominio.trim() || !titulo.trim()) {
      alert(
        "Informe o condomínio e o título da reunião antes de enviar a planilha."
      );
      return;
    }
    if (!arqMoradores) {
      alert("Anexe a lista de moradores.");
      return;
    }
    setImportandoPlanilha(true);
    try {
      const linhasM = await lerLinhas(arqMoradores);
      const eleitores = [];
      for (const r of linhasM) {
        const cpf = normCol(r, "cpf");
        eleitores.push({
          nome: normCol(r, "nome"),
          cpf_hash: cpf ? await sha256Hex(cpf) : "",
          bloco: normCol(r, "bloco"),
          apartamento: normCol(r, "apartamento", "apto", "ap"),
          email: normCol(r, "email", "e-mail"),
        });
      }
      if (eleitores.length === 0) {
        alert("A lista de moradores está vazia ou sem dados válidos.");
        return;
      }

      const inadimplentes: { bloco: string; apartamento: string }[] = [];
      if (arqInadimplentes) {
        const linhasI = await lerLinhas(arqInadimplentes);
        for (const r of linhasI) {
          const ap = normCol(r, "apartamento", "apto", "ap");
          if (ap) inadimplentes.push({ bloco: normCol(r, "bloco"), apartamento: ap });
        }
      }

      const res = await api.importarPlanilhaCompleta(
        nomeCondominio.trim(),
        titulo.trim(),
        eleitores,
        inadimplentes
      );
      setModalPlanilhaOpen(false);
      alert(
        `Pronto! ${res.criados} morador(es) importado(s)` +
          (res.pulados ? `, ${res.pulados} já existiam` : "") +
          (res.inadimplentes_marcados
            ? `.\n${res.inadimplentes_marcados} unidade(s) marcada(s) como inadimplente — poderão participar, mas não votar`
            : "") +
          `.\nCondomínio, lista de presença e votação foram criados. ` +
          `Agora é só adicionar as perguntas da votação.`
      );
      router.push(`/admin/assembleias/${res.assembleia_id}`);
    } catch {
      alert(
        "Não foi possível importar agora. Confira as planilhas (colunas: nome, cpf, bloco, apartamento) e tente novamente."
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
      await api.createListaPresenca(
        titulo.trim(),
        nomeCondominio.trim(),
        comEsquema(linkSala)
      );
      setTitulo("");
      setLinkSala("");
      setModalOpen(false);
      carregar();
    } catch (e: any) {
      const erro = e?.response?.data?.link_reuniao;
      alert(
        Array.isArray(erro)
          ? `Link da sala: ${erro[0]}`
          : "Não foi possível criar a lista agora. Tente novamente em instantes."
      );
    } finally {
      setSalvando(false);
    }
  }

  // JSX calculado (não um componente aninhado): usar <CondominioPicker/> aqui
  // remontaria o input a cada render e faria ele perder o foco ao digitar.
  const condominioPicker = (
    <>
      <label className="block text-sm font-medium mb-1">Condomínio</label>
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
          />
        )}
        <p className="text-xs text-gray-500 mb-4">
          {condominios.length > 0 && !modoNovoCond
            ? "Escolha o condomínio para vincular a lista aos eleitores e ao reconhecimento facial deste condomínio."
            : "Aparece na lista e vincula o reconhecimento facial dos moradores deste condomínio."}
        </p>
      </>
  );

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
            onClick={abrirModalPlanilha}
            className="btn-secondary flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Importar planilha
          </button>
          <button
            onClick={abrirModal}
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
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
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
                onClick={() => abrirModalSala(l)}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-indigo-700/30 hover:bg-indigo-700"
              >
                <Video className="w-4 h-4" />
                {l.link_reuniao ? "Alterar sala" : "Link da sala"}
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

      {/* Modal: importar planilha (moradores + inadimplentes) */}
      {modalPlanilhaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" /> Importar
                planilha
              </h2>
              <button onClick={() => setModalPlanilhaOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
              O sistema compara a <b>lista de moradores</b> com a{" "}
              <b>lista de inadimplentes</b> e, à medida que as pessoas se
              cadastram na presença, marca <b>automaticamente</b> as unidades
              inadimplentes. Elas podem participar e assistir à assembleia, mas
              ficam <b>impedidas de votar</b>.
            </p>

            {condominioPicker}

            <label className="block text-sm font-medium mb-1">
              Título da reunião
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Assembleia ordinária 06/2026"
              className="input-field w-full mb-4"
            />

            <label className="block text-sm font-medium mb-1">
              Lista de moradores
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setArqMoradores(e.target.files?.[0] || null)}
              disabled={importandoPlanilha}
              className="input-field w-full mb-1 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mb-4">
              Colunas: <b>nome</b>, <b>cpf</b>, <b>bloco</b>,{" "}
              <b>apartamento</b> (e-mail opcional).
            </p>

            <label className="block text-sm font-medium mb-1">
              Lista de inadimplentes{" "}
              <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setArqInadimplentes(e.target.files?.[0] || null)}
              disabled={importandoPlanilha}
              className="input-field w-full mb-1 file:mr-3 file:rounded-md file:border-0 file:bg-red-50 file:px-3 file:py-1.5 file:text-red-700 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 mb-4">
              Colunas: <b>bloco</b> e <b>apartamento</b>. Essas unidades poderão
              se cadastrar e assistir à assembleia, mas ficarão{" "}
              <b>impedidas de votar</b>.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalPlanilhaOpen(false)}
                className="btn-secondary"
                disabled={importandoPlanilha}
              >
                Cancelar
              </button>
              <button
                onClick={importarComPlanilha}
                disabled={importandoPlanilha}
                className="btn-primary disabled:opacity-50"
              >
                {importandoPlanilha ? "Importando…" : "Importar e criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nova lista sem planilha (moradores se cadastram na hora) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova lista de presença</h2>
              <button onClick={() => setModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {condominioPicker}

            <label className="block text-sm font-medium mb-1">Título</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Assembleia ordinária 06/2026"
              className="input-field w-full mb-4"
            />

            <label className="block text-sm font-medium mb-1">
              Link da sala da assembleia{" "}
              <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <input
              value={linkSala}
              onChange={(e) => setLinkSala(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="input-field w-full mb-1"
            />
            <p className="text-xs text-gray-500 mb-4">
              O botão de entrar na sala aparece para o morador só depois que ele
              registra a presença. Dá para colar o link depois, no botão
              &quot;Link da sala&quot;.
            </p>

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

      {/* Modal: link da sala de vídeo desta lista */}
      {modalSala && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-600" /> Sala da assembleia
              </h2>
              <button onClick={() => setModalSala(null)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{modalSala.titulo}</p>

            <label className="block text-sm font-medium mb-1">
              Endereço da videochamada
            </label>
            <input
              value={linkSala}
              onChange={(e) => setLinkSala(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="input-field w-full mb-1"
              autoFocus
            />
            <p className="text-xs text-gray-500 mb-4">
              Assim que o morador terminar a lista de presença, aparece para ele
              o botão &quot;Entrar na sala da Assembleia&quot;. Antes disso o
              endereço não fica visível. Para tirar a sala, apague o campo e
              salve.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalSala(null)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={salvarSala}
                disabled={salvandoSala}
                className="btn-primary disabled:opacity-50"
              >
                {salvandoSala ? "Salvando..." : "Salvar link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

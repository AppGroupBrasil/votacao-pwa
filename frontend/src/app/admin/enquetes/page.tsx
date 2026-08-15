"use client";

import { useState, useEffect } from "react";
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
  ShieldCheck,
  ClipboardList,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import ComoFunciona from "@/components/ComoFunciona";
import type { Enquete, ListaPresenca } from "@/lib/types";

// Tipos de reunião que o síndico escolhe ao gerar a lista rápida. Vira o título
// da lista, que aparece embaixo do nome do condomínio na tela do morador.
const TIPOS_ASSEMBLEIA = [
  "Assembleia Geral Ordinária (AGO)",
  "Assembleia Geral Extraordinária (AGE)",
  "Reunião de condôminos",
  "Outro",
];

export default function VotacaoRapidaPage() {
  const [enquetes, setEnquetes] = useState<Enquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>(["", ""]);
  const [votoAberto, setVotoAberto] = useState(false);
  const [exigeIdent, setExigeIdent] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState<string>("");

  // Listas de presença rápidas: só as criadas com modo_rapido. As listas
  // completas (com planilha e CPF) continuam na tela de Presença.
  const [listas, setListas] = useState<ListaPresenca[]>([]);
  const [modalLista, setModalLista] = useState(false);
  const [condNome, setCondNome] = useState("");
  const [condPadrao, setCondPadrao] = useState("");
  const [tipoAssembleia, setTipoAssembleia] = useState(TIPOS_ASSEMBLEIA[0]);
  const [tipoOutro, setTipoOutro] = useState("");
  const [salvandoLista, setSalvandoLista] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const [criada, setCriada] = useState<ListaPresenca | null>(null);
  const [copiadoLista, setCopiadoLista] = useState("");

  function carregar() {
    setLoading(true);
    api
      .getEnquetes()
      .then((d) => setEnquetes(d.results || (d as any)))
      .finally(() => setLoading(false));
    api
      .getListasPresenca({ rapido: true })
      .then((d) => setListas((d.results || (d as any)) as ListaPresenca[]))
      .catch(() => setListas([]));
  }

  useEffect(() => {
    carregar();
    // Guarda o condomínio da conta para já vir preenchido no modal: digitar
    // outro nome aqui viraria um condomínio novo (ou renomearia o dele).
    api
      .getCondominios()
      .then((d) => {
        const lista = (d.results || (d as any)) as { nome: string }[];
        if (lista?.length === 1) setCondPadrao(lista[0].nome || "");
      })
      .catch(() => {});
  }, []);

  function abrirModalLista() {
    setCondNome(condPadrao);
    setTipoAssembleia(TIPOS_ASSEMBLEIA[0]);
    setTipoOutro("");
    setErroLista("");
    setCriada(null);
    setModalLista(true);
  }

  async function criarLista() {
    setErroLista("");
    const titulo =
      tipoAssembleia === "Outro" ? tipoOutro.trim() : tipoAssembleia;
    if (!condNome.trim()) {
      setErroLista("Informe o nome do condomínio.");
      return;
    }
    if (!titulo) {
      setErroLista("Informe o tipo da reunião.");
      return;
    }
    setSalvandoLista(true);
    try {
      const lista = await api.createListaPresenca(titulo, condNome.trim(), "", {
        modo_rapido: true,
      });
      setCriada(lista);
      carregar();
    } catch {
      setErroLista("Erro ao criar a lista de presença.");
    } finally {
      setSalvandoLista(false);
    }
  }

  function linkLista(l: ListaPresenca) {
    if (typeof window === "undefined") return "";
    return l.codigo_curto
      ? `${window.location.origin}/v/${l.codigo_curto}`
      : `${window.location.origin}/presenca/${l.id}`;
  }

  async function copiarLinkLista(l: ListaPresenca) {
    try {
      await navigator.clipboard.writeText(linkLista(l));
      setCopiadoLista(l.id);
      setTimeout(() => setCopiadoLista(""), 2000);
    } catch {
      /* ignore */
    }
  }

  async function alternarLista(l: ListaPresenca) {
    await api.updateListaPresenca(l.id, { ativa: !l.ativa });
    carregar();
  }

  async function excluirLista(l: ListaPresenca) {
    if (!confirm("Excluir esta lista e todas as presenças registradas?")) return;
    await api.deleteListaPresenca(l.id);
    carregar();
  }

  function abrirModal() {
    setTitulo("");
    setOpcoes(["", ""]);
    setVotoAberto(false);
    setExigeIdent(false);
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
      await api.createEnquete(titulo.trim(), limpo, {
        voto_aberto: votoAberto,
        exige_identificacao: exigeIdent,
      });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Votação rápida</h1>
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
          <Plus className="w-4 h-4" /> Nova votação
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
                  {e.exige_identificacao && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-700 px-2 py-0.5 text-xs font-medium">
                      <ShieldCheck className="w-3 h-3" /> Identificação
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
                  href={`/enquete/${e.id}?resultado=1`}
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
                className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
              >
                {copiado === e.id ? (
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
                href={linkPublico(e)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
              >
                <Eye className="w-4 h-4" /> Ver como morador
              </a>
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
            </div>
          </div>
        ))}
      </div>

      <section className="mt-10 border-t border-gray-200 pt-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <ClipboardList className="h-5 w-5 text-primary-600" /> Lista de
              presença rápida
            </h2>
            <p className="text-sm text-gray-500">
              Sem planilha e sem reconhecimento facial. O morador assina com foto,
              assinatura, aparelho, localização e IP.
            </p>
          </div>
          <button
            onClick={abrirModalLista}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Nova lista de presença
          </button>
        </div>

        {listas.length === 0 && (
          <div className="card py-8 text-center">
            <p className="text-gray-500">
              Nenhuma lista rápida criada ainda. Informe o condomínio e o tipo da
              reunião: o link sai na hora.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {listas.map((l) => (
            <div key={l.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">
                    {l.condominio_nome || l.titulo}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {l.condominio_nome ? `${l.titulo} · ` : ""}
                    {l.total_registros} presença
                    {l.total_registros !== 1 ? "s" : ""} ·{" "}
                    {l.ativa ? (
                      <span className="text-green-600">aberta</span>
                    ) : (
                      <span className="text-gray-400">encerrada</span>
                    )}
                  </p>
                </div>
                <a
                  href={`/admin/listas-presenca/${l.id}`}
                  className="btn-secondary inline-flex shrink-0 items-center gap-1 text-sm"
                >
                  <Users className="h-4 w-4" /> Ver presenças
                </a>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => copiarLinkLista(l)}
                  className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
                >
                  {copiadoLista === l.id ? (
                    <>
                      <Check className="h-4 w-4" /> Copiado!
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-4 w-4" /> Copiar link
                    </>
                  )}
                </button>
                <a
                  href={linkLista(l)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
                >
                  <Eye className="h-4 w-4" /> Ver como morador
                </a>
                <button
                  onClick={() => alternarLista(l)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  <Power className="h-4 w-4" /> {l.ativa ? "Encerrar" : "Reabrir"}
                </button>
                <button
                  onClick={() => excluirLista(l)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modalLista && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {criada ? "Lista criada" : "Nova lista de presença"}
              </h2>
              <button onClick={() => setModalLista(false)}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {criada ? (
              <div>
                <p className="text-sm text-gray-600">
                  Compartilhe este link com os moradores. Quem abrir tira a foto,
                  assina e entra na lista.
                </p>
                <div className="mt-3 break-all rounded-lg bg-gray-50 p-3 font-mono text-sm ring-1 ring-gray-200">
                  {linkLista(criada)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => copiarLinkLista(criada)}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
                  >
                    {copiadoLista === criada.id ? (
                      <>
                        <Check className="h-4 w-4" /> Copiado!
                      </>
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4" /> Copiar link
                      </>
                    )}
                  </button>
                  <a
                    href={linkLista(criada)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
                  >
                    <Eye className="h-4 w-4" /> Ver como morador
                  </a>
                </div>
                <button
                  onClick={() => setModalLista(false)}
                  className="btn-primary mt-5 w-full"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nome do condomínio
                </label>
                <input
                  value={condNome}
                  onChange={(e) => setCondNome(e.target.value)}
                  placeholder="Ex.: Residencial Interlagos"
                  className="input-field mb-4 w-full"
                />

                <label className="mb-1 block text-sm font-medium">
                  Tipo da reunião
                </label>
                <select
                  value={tipoAssembleia}
                  onChange={(e) => setTipoAssembleia(e.target.value)}
                  className="input-field mb-3 w-full"
                >
                  {TIPOS_ASSEMBLEIA.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {tipoAssembleia === "Outro" && (
                  <input
                    value={tipoOutro}
                    onChange={(e) => setTipoOutro(e.target.value)}
                    placeholder="Escreva o tipo da reunião"
                    className="input-field mb-3 w-full"
                  />
                )}

                <p className="mb-4 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
                  Esta lista não usa CPF nem reconhecimento facial. Cada presença
                  fica registrada com foto, assinatura, aparelho, localização e
                  IP.
                </p>

                {erroLista && (
                  <p className="mb-3 text-sm text-red-600">{erroLista}</p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setModalLista(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={criarLista}
                    disabled={salvandoLista}
                    className="btn-primary flex-1"
                  >
                    {salvandoLista ? "Criando..." : "Criar e gerar link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Nova votação</h2>
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

            <label className="mt-5 block text-sm font-medium mb-2">
              Identificação de quem vota
            </label>
            <button
              type="button"
              onClick={() => setExigeIdent((v) => !v)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${
                exigeIdent
                  ? "border-primary-600 bg-primary-50"
                  : "border-gray-300 hover:bg-gray-50"
              }`}
            >
              <ShieldCheck
                className={`w-5 h-5 shrink-0 ${
                  exigeIdent ? "text-primary-600" : "text-gray-400"
                }`}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  Exigir identificação para votar
                </span>
                <span className="block text-xs text-gray-500">
                  O morador tira uma selfie e informa nome, bloco, apartamento e
                  assinatura, com autorização da LGPD, antes de votar.
                </span>
              </span>
              <span
                className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
                  exigeIdent ? "bg-primary-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white shadow transition ${
                    exigeIdent ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>

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

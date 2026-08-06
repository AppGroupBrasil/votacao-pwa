"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Vote,
  Link as LinkIcon,
  Check,
  ExternalLink,
  Share2,
  ClipboardList,
  ListChecks,
  BarChart3,
  Play,
  Square,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio, AssembleiaListItem, Questao } from "@/lib/types";

const TIPOS_SUGERIDOS = [
  "Assembleia Geral Ordinária (AGO)",
  "Assembleia Geral Extraordinária (AGE)",
  "Eleição de Síndico",
];

// Quantas assembleias aparecem em card aqui embaixo. Cada card busca as
// questões numa chamada própria, então o limite evita dezenas de requisições
// em contas com histórico grande — o resto continua em /admin/assembleias.
const LIMITE_CARDS = 10;

const STATUS_INFO: Record<string, { label: string; classe: string }> = {
  rascunho: { label: "Fechada", classe: "bg-red-100 text-red-700" },
  aberta: { label: "Aberta", classe: "bg-green-100 text-green-700" },
  encerrada: { label: "Fechada", classe: "bg-red-100 text-red-700" },
};

type CardAssembleia = AssembleiaListItem & { questoes: Questao[] };

type QuestaoLocal = { titulo: string; respostas: string[] };

function novaQuestao(): QuestaoLocal {
  return { titulo: "", respostas: ["", ""] };
}

export default function VotacaoSimplesPage() {
  const router = useRouter();
  const [nomeCondominio, setNomeCondominio] = useState("");
  const [titulo, setTitulo] = useState("");
  const [questoes, setQuestoes] = useState<QuestaoLocal[]>([novaQuestao()]);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [cards, setCards] = useState<CardAssembleia[]>([]);
  const [carregandoCards, setCarregandoCards] = useState(true);
  const [copiado, setCopiado] = useState("");
  const [destaque, setDestaque] = useState("");

  async function carregarCards() {
    setCarregandoCards(true);
    try {
      const d = await api.getAssembleias();
      const lista = (d.results || (d as any as AssembleiaListItem[])) || [];
      const recentes = [...lista]
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
        .slice(0, LIMITE_CARDS);
      // As questões só vêm no detalhe; se uma falhar, o card aparece do mesmo
      // jeito, só sem a lista de perguntas.
      const questoes = await Promise.all(
        recentes.map((a) =>
          api
            .getAssembleia(a.id)
            .then((full) => full.questoes || [])
            .catch(() => [] as Questao[])
        )
      );
      setCards(recentes.map((a, i) => ({ ...a, questoes: questoes[i] })));
    } catch {
      setCards([]);
    } finally {
      setCarregandoCards(false);
    }
  }

  useEffect(() => {
    carregarCards();
  }, []);

  function origem() {
    return typeof window === "undefined" ? "" : window.location.origin;
  }

  function linkAssembleia(a: AssembleiaListItem) {
    return a.codigo_curto
      ? `${origem()}/vote/${a.codigo_curto}`
      : `${origem()}/votacao/${a.id}`;
  }

  // Link de um item só: abre a votação direto naquela pergunta.
  function linkQuestao(a: AssembleiaListItem, q: Questao) {
    return q.codigo_curto
      ? `${origem()}/v/${q.codigo_curto}`
      : `${origem()}/votacao/${a.id}?q=${q.id}`;
  }

  async function copiar(url: string, chave: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(chave);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  }

  async function compartilhar(url: string, titulo: string, chave: string) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: titulo, url });
        return;
      } catch {
        /* usuário cancelou ou não suportado: cai no copiar */
      }
    }
    await copiar(url, chave);
  }

  async function excluirAssembleia(a: AssembleiaListItem) {
    if (
      !confirm(`Excluir "${a.titulo}" e todos os votos registrados nela?`)
    )
      return;
    try {
      await api.deleteAssembleia(a.id);
      carregarCards();
    } catch {
      alert("Não foi possível excluir agora. Tente novamente.");
    }
  }

  // Botão único: verde abre (rascunho ou encerrada), vermelho fecha (aberta).
  async function alternarAbertura(a: AssembleiaListItem) {
    if (a.status === "aberta") {
      if (
        !confirm(`Fechar a assembleia "${a.titulo}" agora?\n\nNenhum morador poderá votar enquanto estiver fechada.`)
      )
        return;
      try {
        await api.encerrarAssembleia(a.id);
        carregarCards();
      } catch {
        alert("Não foi possível fechar a assembleia agora. Tente novamente.");
      }
      return;
    }
    if (
      !confirm(`Abrir a assembleia "${a.titulo}" agora?\n\nOs moradores só conseguem votar depois desta ação.`)
    )
      return;
    try {
      if (a.status === "encerrada") {
        await api.reabrirAssembleia(a.id);
      } else {
        await api.abrirAssembleia(a.id);
      }
      carregarCards();
    } catch {
      alert("Não foi possível abrir a assembleia agora. Tente novamente.");
    }
  }

  function atualizarQuestao(i: number, titulo: string) {
    setQuestoes((qs) => qs.map((q, k) => (k === i ? { ...q, titulo } : q)));
  }
  function atualizarResposta(qi: number, ri: number, texto: string) {
    setQuestoes((qs) =>
      qs.map((q, k) =>
        k === qi
          ? { ...q, respostas: q.respostas.map((r, j) => (j === ri ? texto : r)) }
          : q
      )
    );
  }
  function addResposta(qi: number) {
    setQuestoes((qs) =>
      qs.map((q, k) => (k === qi ? { ...q, respostas: [...q.respostas, ""] } : q))
    );
  }
  function removerResposta(qi: number, ri: number) {
    setQuestoes((qs) =>
      qs.map((q, k) =>
        k === qi
          ? { ...q, respostas: q.respostas.filter((_, j) => j !== ri) }
          : q
      )
    );
  }
  function addQuestao() {
    setQuestoes((qs) => [...qs, novaQuestao()]);
  }
  function removerQuestao(qi: number) {
    setQuestoes((qs) => qs.filter((_, k) => k !== qi));
  }

  function questoesValidas() {
    return questoes
      .map((q) => ({
        titulo: q.titulo.trim(),
        respostas: q.respostas.map((r) => r.trim()).filter(Boolean),
      }))
      .filter((q) => q.titulo && q.respostas.length >= 2);
  }

  async function getOrCreateCondominio(nome: string): Promise<Condominio> {
    const alvo = nome.trim().toLowerCase();
    const lista = await api.getCondominios();
    const existente = lista.results.find(
      (c) => c.nome.trim().toLowerCase() === alvo
    );
    if (existente) return existente;
    const cnpj = `SIMPLES-${Date.now()}`.slice(0, 18);
    return api.createCondominio({
      nome: nome.trim(),
      cnpj,
      total_unidades: 0,
      blocos: [],
    });
  }

  async function handleCriar() {
    if (!nomeCondominio.trim()) {
      setErro("Informe o nome do condomínio.");
      return;
    }
    if (!titulo.trim()) {
      setErro("Escolha o tipo de assembleia.");
      return;
    }
    if (questoesValidas().length === 0) {
      setErro("Crie ao menos uma questão com a pergunta e duas respostas.");
      return;
    }
    setErro("");
    setCriando(true);
    let assembleiaId = "";
    try {
      const cond = await getOrCreateCondominio(nomeCondominio);
      const agora = new Date();
      const assembleia = await api.createAssembleia({
        condominio: cond.id,
        titulo: titulo.trim(),
        descricao: "",
        data_inicio: agora.toISOString(),
        data_fim: new Date(agora.getTime() + 4 * 60 * 60 * 1000).toISOString(),
        quorum_minimo: 50,
        primeira_chamada_50_mais_1: true,
        quorum_segunda_chamada: 33,
        segunda_chamada_qualquer_numero: true,
        exigir_confirmacao_email: false,
      });
      assembleiaId = assembleia.id;
      let ordem = 1;
      for (const q of questoesValidas()) {
        await api.createQuestao(assembleia.id, {
          titulo: q.titulo,
          descricao: "",
          ordem: ordem++,
          opcoes: q.respostas.map((texto, j) => ({ texto, ordem: j + 1 })),
        });
      }
      // Fica na página: o card da assembleia recém-criada aparece logo abaixo,
      // já com os botões de link, compartilhar e abrir cada questão.
      setTitulo("");
      setQuestoes([novaQuestao()]);
      setDestaque(assembleia.id);
      setCriando(false);
      await carregarCards();
    } catch {
      if (assembleiaId) {
        alert(
          "A assembleia foi criada, mas houve um erro ao salvar as questões. Adicione-as na página da assembleia."
        );
        router.push(`/admin/assembleias/${assembleiaId}`);
      } else {
        setErro("Erro ao criar a assembleia. Tente novamente.");
        setCriando(false);
      }
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Painel
      </Link>

      <div className="mt-3 mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 p-2.5 text-white">
          <Vote className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Criar assembleia</h1>
          <p className="text-sm text-gray-500">
            Condomínio, tipo e as perguntas. Gera o link e o comprovante. O
            morador se cadastra na hora.
          </p>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nome do condomínio
          </label>
          <input
            type="text"
            value={nomeCondominio}
            onChange={(e) => setNomeCondominio(e.target.value)}
            placeholder="Ex.: Residencial Jardins"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Tipo de assembleia
          </label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Assembleia Geral Ordinária"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {TIPOS_SUGERIDOS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTitulo(t)}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Questões</label>
            <button
              type="button"
              onClick={addQuestao}
              className="inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800"
            >
              <Plus className="w-4 h-4" /> Adicionar questão
            </button>
          </div>

          {questoes.map((q, qi) => (
            <div key={qi} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={q.titulo}
                  onChange={(e) => atualizarQuestao(qi, e.target.value)}
                  placeholder={`Pergunta ${qi + 1}`}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 font-medium focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                />
                {questoes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerQuestao(qi)}
                    className="p-2 text-gray-400 hover:text-red-600"
                    title="Remover questão"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2 pl-1">
                {q.respostas.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-2">
                    <span className="text-gray-300 text-sm w-4">{ri + 1}.</span>
                    <input
                      type="text"
                      value={r}
                      onChange={(e) => atualizarResposta(qi, ri, e.target.value)}
                      placeholder={`Resposta ${ri + 1}`}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
                    />
                    {q.respostas.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removerResposta(qi, ri)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Remover resposta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addResposta(qi)}
                  className="inline-flex items-center gap-1 pl-6 text-xs text-gray-500 hover:text-primary-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar resposta
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCriar}
          disabled={criando}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
        >
          {criando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Criando...
            </>
          ) : (
            <>
              <Vote className="w-4 h-4" /> Criar e gerar link
            </>
          )}
        </button>
      </div>

      {/* Assembleias já criadas, prontas para clicar: cada card traz o link da
          votação inteira e o link de cada pergunta, no mesmo padrão da lista
          de presença. */}
      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ListChecks className="h-5 w-5 text-primary-600" /> Assembleias
            criadas
          </h2>
          <Link
            href="/admin/assembleias"
            className="text-sm text-primary-700 hover:text-primary-800"
          >
            Ver todas
          </Link>
        </div>

        {carregandoCards && <p className="text-gray-500">Carregando...</p>}

        {!carregandoCards && cards.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center text-gray-500">
            Nenhuma assembleia criada ainda. Crie a primeira acima.
          </div>
        )}

        <div className="space-y-4">
          {cards.map((a) => {
            const st = STATUS_INFO[a.status] || STATUS_INFO.rascunho;
            const url = linkAssembleia(a);
            return (
              <div
                key={a.id}
                /* Moldura: borda grossa + sombra para cada assembleia virar
                   um bloco visualmente separado do resto da página. */
                className={`rounded-2xl border-2 bg-white p-4 shadow-md transition hover:shadow-lg ${
                  destaque === a.id
                    ? "border-primary-500 ring-4 ring-primary-200"
                    : "border-gray-300"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold break-words">
                        {a.titulo}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.classe}`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {a.condominio_nome} · {a.questoes.length || a.total_questoes}{" "}
                      pergunta
                      {(a.questoes.length || a.total_questoes) !== 1 ? "s" : ""} ·{" "}
                      {a.total_votantes} votante
                      {a.total_votantes !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {/* Atalho direto para a apuração desta assembleia:
                        abre a aba Resultados já com ela selecionada. */}
                    <Link
                      href={`/admin/assembleias?tab=resultados&id=${a.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
                    >
                      <BarChart3 className="h-4 w-4 text-white" /> Resultado
                    </Link>
                    <Link
                      href={`/admin/assembleias/${a.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                    >
                      <ClipboardList className="h-4 w-4" /> Gerenciar
                    </Link>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copiar(url, a.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
                  >
                    {copiado === a.id ? (
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
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
                  >
                    <ExternalLink className="h-4 w-4" /> Ver página
                  </a>
                  <button
                    type="button"
                    onClick={() => alternarAbertura(a)}
                    className={
                      a.status === "aberta"
                        ? "inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-red-700/30 hover:bg-red-700"
                        : "inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
                    }
                  >
                    {a.status === "aberta" ? (
                      <>
                        <Square className="h-4 w-4" /> Fechar assembleia
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Abrir assembleia
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => compartilhar(url, a.titulo, a.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-700 px-3 py-2 text-sm font-bold text-white shadow-sm ring-1 ring-gray-800/30 hover:bg-gray-800"
                  >
                    <Share2 className="h-4 w-4" /> Compartilhar
                  </button>
                  {a.status !== "aberta" && (
                    <button
                      type="button"
                      onClick={() => excluirAssembleia(a)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  )}
                </div>

                {a.questoes.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                    {a.questoes.map((q, i) => {
                      const urlQ = linkQuestao(a, q);
                      return (
                        <div
                          key={q.id}
                          /* Moldura própria da questão, dentro da moldura
                             da assembleia. */
                          className="rounded-xl border border-gray-300 bg-gray-50 p-3 shadow-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 break-words font-medium">
                              {i + 1}. {q.titulo}
                              {q.encerrada && (
                                <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                                  encerrada
                                </span>
                              )}
                            </p>
                          </div>
                          {q.opcoes?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {q.opcoes.map((o) => (
                                <span
                                  key={o.id}
                                  className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600"
                                >
                                  {o.texto}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <a
                              href={urlQ}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1.5 text-xs font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 hover:bg-amber-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Ver
                              questão
                            </a>
                            <button
                              type="button"
                              onClick={() => copiar(urlQ, q.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-orange-600/30 hover:bg-orange-600"
                            >
                              {copiado === q.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5" /> Copiado!
                                </>
                              ) : (
                                <>
                                  <LinkIcon className="h-3.5 w-3.5" /> Copiar
                                  link
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => compartilhar(urlQ, q.titulo, q.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-green-700/30 hover:bg-green-700"
                            >
                              <Share2 className="h-3.5 w-3.5" /> Compartilhar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

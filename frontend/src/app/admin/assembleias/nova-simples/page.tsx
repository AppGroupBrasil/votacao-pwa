"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2, Vote } from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";

const TIPOS_SUGERIDOS = [
  "Assembleia Geral Ordinária (AGO)",
  "Assembleia Geral Extraordinária (AGE)",
  "Eleição de Síndico",
];

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
      router.push(`/admin/assembleias/${assembleia.id}`);
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
          <h1 className="text-2xl font-bold">Votação Simples</h1>
          <p className="text-sm text-gray-500">
            Na hora: condomínio, tipo e as questões. Gera o link e o comprovante.
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
    </div>
  );
}

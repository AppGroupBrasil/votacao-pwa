"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Check, Pencil, Plus, X, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";

type Etapa = "condominio" | "titulo" | "questoes" | "revisao";

const ORDEM_ETAPAS: Etapa[] = ["condominio", "titulo", "questoes", "revisao"];

const TITULOS_SUGERIDOS = [
  "Eleição de Síndico",
  "Assembleia Geral Ordinária",
  "Assembleia Geral Extraordinária",
];

interface QuestaoRascunho {
  titulo: string;
  respostas: string[];
}

function fmtDatetimeLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function NovaAssembleiaPage() {
  const router = useRouter();
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [carregandoCond, setCarregandoCond] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  const [etapa, setEtapa] = useState<Etapa>("condominio");
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [titulo, setTitulo] = useState("");
  const [questoes, setQuestoes] = useState<QuestaoRascunho[]>([
    { titulo: "", respostas: ["", ""] },
  ]);

  const agora = new Date();
  const [avancadasOpen, setAvancadasOpen] = useState(false);
  const [avancadas, setAvancadas] = useState({
    descricao: "",
    data_inicio: fmtDatetimeLocal(agora),
    data_fim: fmtDatetimeLocal(new Date(agora.getTime() + 4 * 60 * 60 * 1000)),
    quorum_minimo: 50,
    primeira_chamada_50_mais_1: true,
    quorum_segunda_chamada: 33,
    segunda_chamada_qualquer_numero: true,
    exigir_confirmacao_email: true,
    modo_multiplas_unidades: "sindico" as "sindico" | "morador",
  });

  useEffect(() => {
    api
      .getCondominios()
      .then((data) => {
        const lista: Condominio[] = data.results || data;
        setCondominios(lista);
        // Um único condomínio: já entra escolhido e a etapa nem aparece.
        if (lista.length === 1) {
          setCondominio(lista[0]);
          setEtapa("titulo");
        }
      })
      .finally(() => setCarregandoCond(false));
  }, []);

  function escolherCondominio(c: Condominio) {
    setCondominio(c);
    setEtapa("titulo");
  }

  function confirmarTitulo(valor?: string) {
    const t = (valor ?? titulo).trim();
    if (!t) return;
    setTitulo(t);
    setEtapa("questoes");
  }

  function setQuestao(i: number, dados: Partial<QuestaoRascunho>) {
    setQuestoes((qs) => qs.map((q, j) => (j === i ? { ...q, ...dados } : q)));
  }

  function setResposta(i: number, j: number, texto: string) {
    setQuestoes((qs) =>
      qs.map((q, k) =>
        k === i
          ? { ...q, respostas: q.respostas.map((r, l) => (l === j ? texto : r)) }
          : q
      )
    );
  }

  function questoesValidas() {
    return questoes
      .map((q) => ({
        titulo: q.titulo.trim(),
        respostas: q.respostas.map((r) => r.trim()).filter(Boolean),
      }))
      .filter((q) => q.titulo && q.respostas.length >= 2);
  }

  function confirmarQuestoes() {
    if (questoesValidas().length === 0) {
      setErro("Preencha ao menos uma questão com a pergunta e duas respostas.");
      return;
    }
    setErro("");
    setEtapa("revisao");
  }

  async function handleCriar() {
    if (!condominio) return;
    setCriando(true);
    setErro("");
    let assembleiaId = "";
    try {
      const assembleia = await api.createAssembleia({
        condominio: condominio.id,
        titulo,
        descricao: avancadas.descricao,
        data_inicio: new Date(avancadas.data_inicio).toISOString(),
        data_fim: new Date(avancadas.data_fim).toISOString(),
        quorum_minimo: avancadas.quorum_minimo,
        primeira_chamada_50_mais_1: avancadas.primeira_chamada_50_mais_1,
        quorum_segunda_chamada: avancadas.quorum_segunda_chamada,
        segunda_chamada_qualquer_numero: avancadas.segunda_chamada_qualquer_numero,
        exigir_confirmacao_email: avancadas.exigir_confirmacao_email,
        modo_multiplas_unidades: avancadas.modo_multiplas_unidades,
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
          "A assembleia foi criada, mas houve um erro ao salvar as questões. Adicione as questões na página da assembleia."
        );
        router.push(`/admin/assembleias/${assembleiaId}`);
      } else {
        setErro("Erro ao criar a assembleia. Tente novamente.");
        setCriando(false);
      }
    }
  }

  const indiceEtapa = ORDEM_ETAPAS.indexOf(etapa);
  const mostrarChipCondominio =
    condominio && indiceEtapa > 0 && condominios.length > 1;
  const mostrarChipTitulo = titulo.trim() && indiceEtapa > 1;
  const nQuestoes = questoesValidas().length;

  if (!carregandoCond && condominios.length === 0) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Nova Assembleia</h1>
        <div className="card text-center py-10">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">
            Cadastre um condomínio primeiro
          </h2>
          <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
            Para criar a primeira assembleia, é preciso ter ao menos um
            condomínio cadastrado. Cadastre o condomínio e volte aqui.
          </p>
          <Link href="/admin/cadastro" className="btn-primary inline-flex">
            Cadastrar condomínio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Nova Assembleia</h1>

      {(mostrarChipCondominio || mostrarChipTitulo || indiceEtapa > 2) && (
        <div className="space-y-2 mb-4">
          {mostrarChipCondominio && (
            <button
              type="button"
              onClick={() => setEtapa("condominio")}
              className="w-full flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-left"
            >
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-gray-700 truncate">
                Condomínio: <strong>{condominio?.nome}</strong>
              </span>
              <Pencil className="w-3.5 h-3.5 text-gray-400 ml-auto shrink-0" />
            </button>
          )}
          {mostrarChipTitulo && (
            <button
              type="button"
              onClick={() => setEtapa("titulo")}
              className="w-full flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-left"
            >
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-gray-700 truncate">
                Assembleia: <strong>{titulo}</strong>
              </span>
              <Pencil className="w-3.5 h-3.5 text-gray-400 ml-auto shrink-0" />
            </button>
          )}
          {indiceEtapa > 2 && (
            <button
              type="button"
              onClick={() => setEtapa("questoes")}
              className="w-full flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-left"
            >
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-gray-700 truncate">
                Votação: <strong>{nQuestoes} {nQuestoes > 1 ? "questões" : "questão"}</strong>
              </span>
              <Pencil className="w-3.5 h-3.5 text-gray-400 ml-auto shrink-0" />
            </button>
          )}
        </div>
      )}

      {etapa === "condominio" && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">
            Em qual condomínio será a assembleia?
          </h2>
          <p className="text-sm text-gray-500 mb-4">Toque para escolher.</p>
          {carregandoCond ? (
            <p className="text-gray-500 text-sm">Carregando condomínios...</p>
          ) : (
            <div className="space-y-2">
              {condominios.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => escolherCondominio(c)}
                  className={`w-full text-left border rounded-lg px-4 py-3 hover:border-primary-500 hover:bg-primary-50 transition-colors ${
                    condominio?.id === c.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200"
                  }`}
                >
                  <span className="font-medium">{c.nome}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {etapa === "titulo" && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            confirmarTitulo();
          }}
        >
          <h2 className="text-lg font-semibold mb-1">
            Qual o título da assembleia?
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Toque numa sugestão ou escreva o seu.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {TITULOS_SUGERIDOS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => confirmarTitulo(s)}
                className="border border-primary-200 text-primary-700 bg-primary-50 rounded-full px-3 py-1.5 text-sm hover:bg-primary-100"
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="input-field"
            placeholder="Ex.: Eleição de Síndico 2026"
            maxLength={300}
            autoFocus
          />
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={!titulo.trim()}
              className="btn-primary disabled:opacity-50"
            >
              Continuar
            </button>
            {condominios.length > 1 && (
              <button
                type="button"
                onClick={() => setEtapa("condominio")}
                className="btn-secondary"
              >
                Voltar
              </button>
            )}
          </div>
        </form>
      )}

      {etapa === "questoes" && (
        <div className="space-y-4">
          {questoes.map((q, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold">
                  {questoes.length > 1 ? `Questão ${i + 1}` : "O que será votado?"}
                </h2>
                {questoes.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setQuestoes((qs) => qs.filter((_, j) => j !== i))
                    }
                    className="text-gray-400 hover:text-red-500"
                    aria-label={`Remover questão ${i + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Escreva a pergunta e as respostas que o morador verá.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pergunta
              </label>
              <input
                type="text"
                value={q.titulo}
                onChange={(e) => setQuestao(i, { titulo: e.target.value })}
                className="input-field mb-3"
                placeholder="Ex.: Em quem é o seu voto para síndico?"
                autoFocus={i === questoes.length - 1}
              />
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Respostas
              </label>
              <div className="space-y-2">
                {q.respostas.map((r, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={r}
                      onChange={(e) => setResposta(i, j, e.target.value)}
                      className="input-field"
                      placeholder={`Resposta ${j + 1}`}
                    />
                    {q.respostas.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuestao(i, {
                            respostas: q.respostas.filter((_, l) => l !== j),
                          })
                        }
                        className="text-gray-400 hover:text-red-500 shrink-0"
                        aria-label={`Remover resposta ${j + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setQuestao(i, { respostas: [...q.respostas, ""] })
                }
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" /> Adicionar resposta
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setQuestoes((qs) => [...qs, { titulo: "", respostas: ["", ""] }])
            }
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" /> Adicionar outra questão
          </button>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={confirmarQuestoes}
              className="btn-primary"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={() => setEtapa("titulo")}
              className="btn-secondary"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {etapa === "revisao" && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Confira antes de criar</h2>
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-gray-500">Condomínio:</span>{" "}
                <strong>{condominio?.nome}</strong>
              </p>
              <p>
                <span className="text-gray-500">Assembleia:</span>{" "}
                <strong>{titulo}</strong>
              </p>
              {questoesValidas().map((q, i) => (
                <div key={i} className="border-l-2 border-primary-200 pl-3">
                  <p className="font-medium">{q.titulo}</p>
                  <p className="text-gray-500">{q.respostas.join(" · ")}</p>
                </div>
              ))}
              <p className="text-gray-500">
                Votação de{" "}
                {new Date(avancadas.data_inicio).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                até{" "}
                {new Date(avancadas.data_fim).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" — ajuste em Configurações avançadas se precisar."}
              </p>
            </div>
          </div>

          <div className="card">
            <button
              type="button"
              onClick={() => setAvancadasOpen((v) => !v)}
              className="w-full flex items-center justify-between text-sm font-medium text-gray-700"
            >
              Configurações avançadas
              <ChevronDown
                className={`w-4 h-4 transition-transform ${avancadasOpen ? "rotate-180" : ""}`}
              />
            </button>
            {avancadasOpen && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={avancadas.descricao}
                    onChange={(e) =>
                      setAvancadas({ ...avancadas, descricao: e.target.value })
                    }
                    className="input-field"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Início
                    </label>
                    <input
                      type="datetime-local"
                      value={avancadas.data_inicio}
                      onChange={(e) =>
                        setAvancadas({ ...avancadas, data_inicio: e.target.value })
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Encerramento
                    </label>
                    <input
                      type="datetime-local"
                      value={avancadas.data_fim}
                      onChange={(e) =>
                        setAvancadas({ ...avancadas, data_fim: e.target.value })
                      }
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quórum Mínimo — 1ª Chamada
                    </label>
                    <label className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={avancadas.primeira_chamada_50_mais_1}
                        onChange={(e) =>
                          setAvancadas({
                            ...avancadas,
                            primeira_chamada_50_mais_1: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-600">
                        50% + 1 (conforme lei)
                      </span>
                    </label>
                    {!avancadas.primeira_chamada_50_mais_1 && (
                      <input
                        type="number"
                        value={avancadas.quorum_minimo}
                        onChange={(e) =>
                          setAvancadas({
                            ...avancadas,
                            quorum_minimo: parseInt(e.target.value) || 0,
                          })
                        }
                        className="input-field w-32"
                        min={0}
                        max={100}
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quórum Mínimo — 2ª Chamada
                    </label>
                    <p className="text-sm text-gray-600">
                      Qualquer número de votantes
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmação por e-mail para votar
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={avancadas.exigir_confirmacao_email}
                      onChange={(e) =>
                        setAvancadas({
                          ...avancadas,
                          exigir_confirmacao_email: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-600">
                      Exigir código de confirmação enviado por e-mail
                    </span>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">
                    Desmarcado: o morador informa o e-mail cadastrado e vota
                    imediatamente, sem código.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Donos de mais de uma unidade
                  </label>
                  <select
                    value={avancadas.modo_multiplas_unidades}
                    onChange={(e) =>
                      setAvancadas({
                        ...avancadas,
                        modo_multiplas_unidades: e.target.value as
                          | "sindico"
                          | "morador",
                      })
                    }
                    className="input-field"
                  >
                    <option value="sindico">
                      Síndico define antecipadamente (cota por unidade)
                    </option>
                    <option value="morador">
                      Morador declara as outras unidades durante a votação
                    </option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCriar}
              disabled={criando}
              className="btn-primary disabled:opacity-50"
            >
              {criando ? "Criando..." : "Criar assembleia e votação"}
            </button>
            <button
              type="button"
              onClick={() => setEtapa("questoes")}
              disabled={criando}
              className="btn-secondary"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

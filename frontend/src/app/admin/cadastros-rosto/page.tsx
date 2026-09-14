"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Loader2, X } from "lucide-react";
import { api, type CadastroFacial } from "@/lib/api";
import type { Condominio } from "@/lib/types";

const PERFIL_LABEL: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  conjuge: "Cônjuge",
  procurador: "Procurador",
  outro: "Outro",
};

type Filtro = "todos" | "conferir" | "procuradores" | "inadimplentes";

/** O que a administração precisa olhar neste cadastro antes da assembleia. */
function pendencias(c: CadastroFacial, temPlanilha: boolean): string[] {
  const p: string[] = [];
  if (temPlanilha && !c.na_planilha) p.push("Fora da planilha");
  if (c.unidade_diferente_da_planilha) p.push("Unidade diferente da planilha");
  if (c.perfil === "procurador") p.push("Conferir procuração");
  if (c.suspeita_duplicidade) p.push("Mesmo rosto de outro CPF");
  if (!c.tem_rosto) p.push("Sem rosto (só foto)");
  return p;
}

function unidade(c: CadastroFacial) {
  return [c.bloco && `Bl. ${c.bloco}`, c.apartamento && `Apto ${c.apartamento}`]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Cadastros do rosto para conferir antes da assembleia: quem é proprietário,
 * quem vem com procuração e quais unidades estão inadimplentes (o voto dessas
 * já sai bloqueado na votação).
 */
export default function CadastrosRostoPage() {
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [condominioId, setCondominioId] = useState("");
  const [cadastros, setCadastros] = useState<CadastroFacial[]>([]);
  const [temPlanilha, setTemPlanilha] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [foto, setFoto] = useState<{ nome: string; selfie: string } | null>(null);
  const [abrindoFoto, setAbrindoFoto] = useState("");

  useEffect(() => {
    const doLink = new URLSearchParams(window.location.search).get("condominio") || "";
    api
      .getCondominios()
      .then((d) => {
        const lista: Condominio[] = (d as any).results || d;
        setCondominios(lista);
        setCondominioId(doLink || (lista.length === 1 ? lista[0].id : ""));
      })
      .catch(() => setErro("Não foi possível carregar os condomínios."))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    if (!condominioId) {
      setCadastros([]);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro("");
    api
      .cadastrosFaciais(condominioId)
      .then((r) => {
        if (!ativo) return;
        setCadastros(r.cadastros);
        setTemPlanilha(r.tem_planilha);
      })
      .catch(() => ativo && setErro("Não foi possível carregar os cadastros."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [condominioId]);

  async function verFoto(c: CadastroFacial) {
    setAbrindoFoto(c.id);
    try {
      const r = await api.cadastroFacialFoto(condominioId, c.id);
      setFoto({ nome: c.nome, selfie: r.selfie });
    } catch {
      alert("Não foi possível abrir a foto.");
    } finally {
      setAbrindoFoto("");
    }
  }

  const contagem = useMemo(
    () => ({
      todos: cadastros.length,
      conferir: cadastros.filter((c) => pendencias(c, temPlanilha).length > 0).length,
      procuradores: cadastros.filter((c) => c.perfil === "procurador").length,
      inadimplentes: cadastros.filter((c) => c.inadimplente).length,
    }),
    [cadastros, temPlanilha]
  );

  const termo = busca.trim().toLowerCase();
  const visiveis = cadastros
    .filter((c) =>
      filtro === "conferir"
        ? pendencias(c, temPlanilha).length > 0
        : filtro === "procuradores"
        ? c.perfil === "procurador"
        : filtro === "inadimplentes"
        ? c.inadimplente
        : true
    )
    .filter((c) =>
      termo ? [c.nome, c.bloco, c.apartamento].some((v) => (v || "").toLowerCase().includes(termo)) : true
    );

  const FILTROS: { v: Filtro; l: string }[] = [
    { v: "todos", l: "Todos" },
    { v: "conferir", l: "Para conferir" },
    { v: "procuradores", l: "Procuradores" },
    { v: "inadimplentes", l: "Inadimplentes" },
  ];

  return (
    <div>
      <Link
        href="/admin/eleitores"
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Moradores
      </Link>
      <h1 className="text-2xl font-bold">Cadastros do rosto</h1>
      <p className="mb-4 max-w-2xl text-sm text-gray-500">
        Confira antes da assembleia: quem se cadastrou é proprietário? Se não é,
        tem procuração? A unidade está inadimplente? Unidade inadimplente já tem o
        voto bloqueado na votação.
      </p>

      {condominios.length > 1 && (
        <select
          value={condominioId}
          onChange={(e) => setCondominioId(e.target.value)}
          className="input-field mb-4 w-full sm:w-72"
        >
          <option value="">Selecione o condomínio</option>
          {condominios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      )}

      {condominioId && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltro(f.v)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  filtro === f.v
                    ? "bg-primary-600 text-white"
                    : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                {f.l} ({contagem[f.v]})
              </button>
            ))}
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, bloco ou apto"
            className="input-field w-full sm:w-64"
          />
        </div>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {carregando ? (
        <p className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </p>
      ) : !condominioId ? (
        <p className="text-gray-500">Selecione o condomínio.</p>
      ) : visiveis.length === 0 ? (
        <div className="card py-10 text-center text-gray-500">Nenhum cadastro nesta lista.</div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium">Cadastro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const p = pendencias(c, temPlanilha);
                return (
                  <tr key={c.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                    <td className="px-4 py-3 text-gray-700">{unidade(c) || "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{PERFIL_LABEL[c.perfil] || c.perfil}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.inadimplente && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Inadimplente
                          </span>
                        )}
                        {p.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                          >
                            {t}
                          </span>
                        ))}
                        {!c.inadimplente && p.length === 0 && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            {temPlanilha ? "Na planilha" : "Sem pendência"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(c.cadastro_antecipado_em || c.criado_em).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      <br />
                      {c.cadastro_antecipado_em ? "pelo link" : "na entrada"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => verFoto(c)}
                        disabled={abrindoFoto === c.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                      >
                        {abrindoFoto === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5" />
                        )}
                        Foto
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {foto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setFoto(null)}
        >
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">{foto.nome}</p>
              <button onClick={() => setFoto(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {foto.selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.selfie} alt={`Foto de ${foto.nome}`} className="w-full rounded-lg" />
            ) : (
              <p className="text-sm text-gray-500">Cadastro sem foto.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

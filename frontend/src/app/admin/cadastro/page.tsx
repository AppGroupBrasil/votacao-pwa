"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Vote,
  CheckCircle2,
  Circle,
  Pencil,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

type Item = {
  key: string;
  href: string;
  titulo: string;
  descricao: string;
  icon: typeof Building2;
  feito: boolean;
  qtd: number;
  sufixo: string;
};

export default function CadastroPage() {
  const [loading, setLoading] = useState(true);
  const [condominios, setCondominios] = useState(0);
  const [moradores, setMoradores] = useState(0);
  const [assembleias, setAssembleias] = useState(0);

  useEffect(() => {
    Promise.all([
      api.getCondominios().catch(() => ({ count: 0 } as any)),
      api.getEleitores().catch(() => ({ count: 0 } as any)),
      api.getAssembleias().catch(() => ({ count: 0 } as any)),
    ])
      .then(([c, e, a]) => {
        setCondominios(c.count ?? (c.results?.length || 0));
        setMoradores(e.count ?? (e.results?.length || 0));
        setAssembleias(a.count ?? (a.results?.length || 0));
      })
      .finally(() => setLoading(false));
  }, []);

  const itens: Item[] = [
    {
      key: "condominio",
      href: "/admin/condominios",
      titulo: "Cadastro do Condomínio",
      descricao: "Nome, blocos e dados do condomínio.",
      icon: Building2,
      feito: condominios > 0,
      qtd: condominios,
      sufixo: condominios === 1 ? "condomínio" : "condomínios",
    },
    {
      key: "moradores",
      href: "/admin/eleitores",
      titulo: "Cadastro dos Moradores",
      descricao: "Moradores por bloco, inadimplência e bloqueios.",
      icon: Users,
      feito: moradores > 0,
      qtd: moradores,
      sufixo: moradores === 1 ? "morador" : "moradores",
    },
    {
      key: "assembleia",
      href: "/admin/assembleias",
      titulo: "Cadastro da Assembleia",
      descricao: "Assembleia, edital de convocação e pauta.",
      icon: Vote,
      feito: assembleias > 0,
      qtd: assembleias,
      sufixo: assembleias === 1 ? "assembleia" : "assembleias",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cadastro</h1>
        <p className="text-sm text-gray-500">
          A base de tudo. Comece pelo condomínio, depois moradores e assembleia.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {itens.map((it) => (
            <div
              key={it.key}
              className={`relative rounded-2xl border bg-white p-5 transition hover:shadow-md ${
                it.feito ? "border-green-300" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`rounded-xl p-2.5 ${
                    it.feito
                      ? "bg-green-50 text-green-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <it.icon className="w-6 h-6" />
                </div>
                {it.feito ? (
                  <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                    <CheckCircle2 className="w-5 h-5" /> Concluído
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-gray-400 text-sm">
                    <Circle className="w-5 h-5" /> Pendente
                  </span>
                )}
              </div>

              <h2 className="mt-4 text-lg font-bold">{it.titulo}</h2>
              <p className="mt-1 text-sm text-gray-500">{it.descricao}</p>
              {it.feito && (
                <p className="mt-2 text-sm text-green-700 font-medium">
                  {it.qtd} {it.sufixo}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                {it.feito ? (
                  <Link
                    href={it.href}
                    className="btn-primary inline-flex items-center gap-1.5 text-sm"
                  >
                    <Pencil className="w-4 h-4" /> Gerenciar
                  </Link>
                ) : (
                  <Link
                    href={it.href}
                    className="btn-primary inline-flex items-center gap-1.5 text-sm"
                  >
                    Cadastrar <ChevronRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

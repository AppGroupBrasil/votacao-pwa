"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Check,
  X,
  Clock,
  Mail,
  IdCard,
  Building2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SolicitacaoExclusao } from "@/lib/types";

const STATUS_STYLE: Record<
  SolicitacaoExclusao["status"],
  { label: string; cls: string; icon: typeof Clock }
> = {
  pendente: {
    label: "Pendente",
    cls: "bg-amber-100 text-amber-700",
    icon: Clock,
  },
  concluida: {
    label: "Concluída",
    cls: "bg-green-100 text-green-700",
    icon: Check,
  },
  recusada: { label: "Recusada", cls: "bg-red-100 text-red-700", icon: X },
};

export default function ExclusoesPage() {
  const router = useRouter();
  const [itens, setItens] = useState<SolicitacaoExclusao[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function carregar() {
    try {
      const d = await api.getSolicitacoesExclusao();
      setItens(d.results);
    } catch {
      router.push("/login");
    }
  }

  useEffect(() => {
    carregar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function mudarStatus(
    id: string,
    status: SolicitacaoExclusao["status"]
  ) {
    setBusy(id);
    try {
      await api.updateSolicitacaoExclusao(id, { status });
      await carregar();
    } finally {
      setBusy(null);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Remover este registro de pedido da lista?")) return;
    setBusy(id);
    try {
      await api.deleteSolicitacaoExclusao(id);
      await carregar();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> Painel
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-primary-100 p-2.5 text-primary-600">
          <Trash2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Pedidos de exclusão (LGPD)</h1>
          <p className="text-sm text-gray-500">
            Moradores que pediram a remoção do cadastro. Confirme após excluir
            os dados.
          </p>
        </div>
      </div>

      {itens === null ? (
        <p className="text-gray-400">Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="card text-center text-gray-500">
          Nenhum pedido de exclusão registrado.
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((s) => {
            const st = STATUS_STYLE[s.status];
            const StIcon = st.icon;
            return (
              <div key={s.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{s.nome}</h2>
                    <p className="text-xs text-gray-400">
                      {new Date(s.criado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}
                  >
                    <StIcon className="h-3.5 w-3.5" /> {st.label}
                  </span>
                </div>

                <div className="mt-3 grid gap-1.5 text-sm text-gray-600 sm:grid-cols-2">
                  {s.cpf && (
                    <span className="inline-flex items-center gap-1.5">
                      <IdCard className="h-4 w-4 text-gray-400" /> {s.cpf}
                    </span>
                  )}
                  {s.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-4 w-4 text-gray-400" /> {s.email}
                    </span>
                  )}
                  {s.condominio && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-gray-400" />{" "}
                      {s.condominio}
                    </span>
                  )}
                </div>

                {s.motivo && (
                  <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                    {s.motivo}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {s.status !== "concluida" && (
                    <button
                      onClick={() => mudarStatus(s.id, "concluida")}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> Marcar como concluída
                    </button>
                  )}
                  {s.status !== "recusada" && (
                    <button
                      onClick={() => mudarStatus(s.id, "recusada")}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" /> Recusar
                    </button>
                  )}
                  {s.status !== "pendente" && (
                    <button
                      onClick={() => mudarStatus(s.id, "pendente")}
                      disabled={busy === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Clock className="h-4 w-4" /> Reabrir
                    </button>
                  )}
                  <button
                    onClick={() => excluir(s.id)}
                    disabled={busy === s.id}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Remover da lista
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { AssembleiaListItem } from "@/lib/types";

const statusLabel: Record<string, { txt: string; cls: string }> = {
  aberta: { txt: "Em andamento", cls: "text-green-600" },
  encerrada: { txt: "Encerrada", cls: "text-gray-400" },
  rascunho: { txt: "Rascunho", cls: "text-amber-600" },
};

export default function AtaHubPage() {
  const [assembleias, setAssembleias] = useState<AssembleiaListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAssembleias()
      .then((d) => setAssembleias(d.results || (d as any)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Resumo e Ata da Assembleia</h1>
        <p className="text-sm text-gray-500">
          Escolha a assembleia para transcrever a gravação e gerar a ata.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : assembleias.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">
            Nenhuma assembleia cadastrada.{" "}
            <Link href="/admin/assembleias" className="text-primary-600 hover:underline">
              Cadastrar agora
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {assembleias.map((a) => {
            const s = statusLabel[a.status] || statusLabel.rascunho;
            return (
              <Link
                key={a.id}
                href={`/admin/assembleias/${a.id}/ata`}
                className="card flex items-center justify-between gap-3 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-xl bg-slate-100 text-slate-600 p-2.5 shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{a.titulo}</h3>
                    <p className="text-sm text-gray-500">
                      {a.condominio_nome} ·{" "}
                      <span className={s.cls}>{s.txt}</span>
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { LogAuditoria, Assembleia } from "@/lib/types";

export default function AuditoriaPage() {
  const params = useParams();
  const id = params.id as string;

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getAssembleia(id), api.getLogsAuditoria(id)])
      .then(([asm, l]) => {
        setAssembleia(asm);
        setLogs(l);
      })
      .catch(() => setErro("Não foi possível carregar a trilha de auditoria."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="w-6 h-6 text-slate-500" />
        <div>
          <h1 className="text-2xl font-bold">Trilha de auditoria</h1>
          <p className="text-sm text-gray-500">{assembleia?.titulo}</p>
        </div>
      </div>

      {erro && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3 font-medium">Data/hora</th>
                <th className="py-2 pr-3 font-medium">Evento</th>
                <th className="py-2 pr-3 font-medium">Detalhe</th>
                <th className="py-2 pr-3 font-medium">Responsável</th>
                <th className="py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                    {new Date(l.criado_em).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-3 font-medium">{l.acao_display}</td>
                  <td className="py-2 pr-3 text-gray-600">{l.descricao}</td>
                  <td className="py-2 pr-3 text-gray-600">{l.ator}</td>
                  <td className="py-2 text-gray-500">{l.ip_address || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

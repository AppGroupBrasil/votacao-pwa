"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { PresencaManualRegistro } from "@/lib/types";

export default function RegistrosPresencaPage() {
  const params = useParams();
  const id = params.id as string;
  const [registros, setRegistros] = useState<PresencaManualRegistro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .getRegistrosPresenca(id)
      .then(setRegistros)
      .finally(() => setLoading(false));
  }, [id]);

  async function excluirRegistro(r: PresencaManualRegistro) {
    if (!confirm(`Excluir a presença de "${r.nome}"? A selfie e a assinatura serão apagadas.`)) return;
    try {
      await api.deleteRegistroPresenca(id, r.id);
      setRegistros((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      alert("Não foi possível excluir. Tente novamente.");
    }
  }

  return (
    <div>
      <Link
        href="/admin/enquetes"
        className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Users className="w-6 h-6 text-indigo-600" /> Presenças registradas
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {registros.length} registro{registros.length !== 1 ? "s" : ""}.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : registros.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          Nenhuma presença registrada ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {registros.map((r) => (
            <div key={r.id} className="card flex items-center gap-4">
              {r.selfie ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.selfie}
                  alt={r.nome}
                  className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate">{r.nome}</h3>
                <p className="text-sm text-gray-500">
                  {r.bloco ? `Bloco ${r.bloco} · ` : ""}Ap. {r.apartamento}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(r.criado_em).toLocaleString("pt-BR")}
                </p>
              </div>
              {r.assinatura && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.assinatura}
                  alt="Assinatura"
                  className="h-16 w-28 object-contain shrink-0 border border-gray-200 rounded bg-white"
                />
              )}
              <button
                onClick={() => excluirRegistro(r)}
                title="Excluir este registro"
                className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

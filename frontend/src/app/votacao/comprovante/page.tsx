"use client";

import { useState } from "react";
import { Search, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function ComprovantePage() {
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<{
    encontrado: boolean;
    timestamp?: string;
    assembleia?: string;
    questao?: string;
    status?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!hash.trim()) return;
    setLoading(true);
    try {
      const data = await api.verificarVoto(hash.trim());
      setResult(data);
    } catch {
      setResult({ encontrado: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">Verificar Voto</h1>
        <p className="text-sm text-gray-500 mb-6">
          Cole o hash do comprovante para verificar se seu voto foi registrado.
        </p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            className="input-field flex-1"
            placeholder="Hash do comprovante..."
          />
          <button type="submit" disabled={loading} className="btn-primary">
            <Search className="w-4 h-4" />
          </button>
        </form>

        {result && (
          <div
            className={`rounded-lg p-4 ${
              result.encontrado ? "bg-green-50" : "bg-red-50"
            }`}
          >
            {result.encontrado ? (
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">Voto encontrado!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Assembleia: {result.assembleia}
                  </p>
                  <p className="text-sm text-green-700">
                    Questão: {result.questao}
                  </p>
                  {result.status && (
                    <p className="text-sm text-green-700">
                      Situação: {result.status}
                    </p>
                  )}
                  <p className="text-xs text-green-600 mt-1">
                    Registrado em:{" "}
                    {new Date(result.timestamp!).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                <p className="font-medium text-red-800">Voto não encontrado.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

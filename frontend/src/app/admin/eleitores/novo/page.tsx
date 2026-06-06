"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";

export default function NovoEleitorPage() {
  const router = useRouter();
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    condominio: "",
    nome: "",
    cpf_hash: "",
    bloco: "",
    apartamento: "",
    email: "",
    votos_permitidos: 1,
  });

  useEffect(() => {
    api.getCondominios().then((d) => setCondominios(d.results || d));
  }, []);

  const selectedCondominio = condominios.find((c) => c.id === form.condominio);

  function hashCpf(cpf: string): string {
    // CPF is hashed client-side before sending — raw CPF never goes to server
    // Using SubtleCrypto for SHA-256
    return cpf.replace(/\D/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // CPF é opcional; só hasheia no navegador se foi preenchido
      const cpfClean = form.cpf_hash.replace(/\D/g, "");
      let cpfHash = "";
      if (cpfClean) {
        const encoder = new TextEncoder();
        const data = encoder.encode(cpfClean);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        cpfHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      }

      await api.createEleitor({
        ...form,
        cpf_hash: cpfHash,
      });
      router.push("/admin/eleitores");
    } catch {
      alert("Erro ao criar morador.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Novo Morador</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Condomínio
          </label>
          <select
            value={form.condominio}
            onChange={(e) => setForm({ ...form, condominio: e.target.value, bloco: "" })}
            className="input-field"
            required
          >
            <option value="">Selecione...</option>
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome Completo
          </label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            CPF <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.cpf_hash}
            onChange={(e) => setForm({ ...form, cpf_hash: e.target.value })}
            className="input-field"
            placeholder="000.000.000-00"
          />
          <p className="text-xs text-gray-400 mt-1">
            O CPF é hasheado no navegador antes do envio
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bloco
            </label>
            {selectedCondominio && selectedCondominio.blocos.length > 0 ? (
              <select
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                className="input-field"
              >
                <option value="">Selecione...</option>
                {selectedCondominio.blocos.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                className="input-field"
                placeholder="Ex: A, B, Torre 1"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apartamento
            </label>
            <input
              type="text"
              value={form.apartamento}
              onChange={(e) =>
                setForm({ ...form, apartamento: e.target.value })
              }
              className="input-field"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Votos a que tem direito
          </label>
          <input
            type="number"
            min={1}
            value={form.votos_permitidos}
            onChange={(e) =>
              setForm({ ...form, votos_permitidos: Math.max(1, Number(e.target.value) || 1) })
            }
            className="input-field"
          />
          <p className="text-xs text-gray-500 mt-1">
            Padrão 1 (uma unidade). Aumente quando o morador possui mais de uma
            unidade — ele terá esse número de votos por questão.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Criando..." : "Criar Morador"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

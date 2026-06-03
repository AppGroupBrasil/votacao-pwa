"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";

export default function EditarMoradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    condominio: "",
    nome: "",
    bloco: "",
    apartamento: "",
    email: "",
  });

  useEffect(() => {
    Promise.all([
      api.getCondominios().then((d) => setCondominios(d.results || d)),
      api.getEleitor(id).then((e) =>
        setForm({
          condominio: e.condominio,
          nome: e.nome,
          bloco: e.bloco,
          apartamento: e.apartamento,
          email: e.email,
        })
      ),
    ])
      .catch(() => alert("Erro ao carregar o morador."))
      .finally(() => setLoading(false));
  }, [id]);

  const selectedCondominio = condominios.find((c) => c.id === form.condominio);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateEleitor(id, form);
      router.push("/admin/eleitores");
    } catch {
      alert("Erro ao salvar o morador.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Carregando...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Editar Morador</h1>

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
              onChange={(e) => setForm({ ...form, apartamento: e.target.value })}
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

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Salvando..." : "Salvar"}
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

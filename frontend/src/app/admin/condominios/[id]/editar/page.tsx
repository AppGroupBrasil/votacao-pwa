"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import BlocosEditor from "@/components/BlocosEditor";

export default function EditarCondominioPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    total_unidades: 0,
    blocos: [] as string[],
  });

  useEffect(() => {
    api
      .getCondominio(id)
      .then((c) =>
        setForm({
          nome: c.nome,
          cnpj: c.cnpj,
          total_unidades: c.total_unidades,
          blocos: c.blocos || [],
        })
      )
      .catch(() => alert("Erro ao carregar o condomínio."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateCondominio(id, form);
      router.push("/admin/condominios");
    } catch {
      alert("Erro ao salvar o condomínio.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Carregando...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Editar Condomínio</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
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
              CNPJ
            </label>
            <input
              type="text"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              className="input-field"
              placeholder="00.000.000/0000-00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total de Unidades
            </label>
            <input
              type="number"
              value={form.total_unidades}
              onChange={(e) =>
                setForm({ ...form, total_unidades: parseInt(e.target.value) || 0 })
              }
              className="input-field"
              min={1}
              required
            />
          </div>
        </div>

        <BlocosEditor
          blocos={form.blocos}
          onChange={(blocos) => setForm({ ...form, blocos })}
        />

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

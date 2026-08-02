"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Pencil, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";
import BlocosEditor from "@/components/BlocosEditor";

export default function CondominiosPage() {
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cnpj: "",
    total_unidades: 0,
    blocos: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<
    { tipo: "ok" | "erro"; texto: string } | null
  >(null);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    api
      .getCondominios()
      .then((d) => setCondominios(d.results || d))
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const criado = await api.createCondominio(form);
      setShowForm(false);
      setForm({ nome: "", cnpj: "", total_unidades: 0, blocos: [] });
      loadData();
      setMsg({
        tipo: "ok",
        texto: `Condomínio "${criado.nome}" cadastrado com sucesso!`,
      });
    } catch (err: any) {
      const data = err?.response?.data;
      let detalhe = "Erro ao criar condomínio.";
      if (err?.response?.status === 401) {
        detalhe = "Sessão expirada. Faça login novamente para cadastrar.";
      } else if (data && typeof data === "object") {
        const campos = Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
          .join(" | ");
        if (campos) detalhe = campos;
      }
      setMsg({ tipo: "erro", texto: detalhe });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold">Condomínios</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/condominios/montar"
            className="btn-primary flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            Montar condomínio (guiado)
          </Link>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-secondary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cadastro rápido
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            msg.tipo === "ok"
              ? "border-green-300 bg-green-50 text-green-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4">
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
                  setForm({
                    ...form,
                    total_unidades: parseInt(e.target.value) || 0,
                  })
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
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : condominios.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhum condomínio cadastrado.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {condominios.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-lg">{c.nome}</h3>
                <Link
                  href={`/admin/condominios/${c.id}/editar`}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                  title="Editar condomínio"
                >
                  <Pencil className="w-4 h-4" />
                </Link>
              </div>
              <p className="text-sm text-gray-500 mt-1">CNPJ: {c.cnpj}</p>
              <p className="text-sm text-gray-500">
                {c.total_unidades} unidade{c.total_unidades !== 1 ? "s" : ""}
              </p>
              {c.blocos && c.blocos.length > 0 && (
                <p className="text-sm text-gray-500">
                  Blocos: {c.blocos.join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

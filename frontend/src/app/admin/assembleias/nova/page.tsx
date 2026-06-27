"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";

export default function NovaAssembleiaPage() {
  const router = useRouter();
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [carregandoCond, setCarregandoCond] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    condominio: "",
    titulo: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    quorum_minimo: 50,
    primeira_chamada_50_mais_1: true,
    quorum_segunda_chamada: 33,
    segunda_chamada_qualquer_numero: false,
    modo_multiplas_unidades: "sindico" as "sindico" | "morador",
  });

  useEffect(() => {
    api
      .getCondominios()
      .then((data) => setCondominios(data.results || data))
      .finally(() => setCarregandoCond(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const assembleia = await api.createAssembleia({
        ...form,
        data_inicio: new Date(form.data_inicio).toISOString(),
        data_fim: new Date(form.data_fim).toISOString(),
      });
      router.push(`/admin/assembleias/${assembleia.id}`);
    } catch {
      alert("Erro ao criar assembleia.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Nova Assembleia</h1>

      {!carregandoCond && condominios.length === 0 ? (
        <div className="card text-center py-10">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-1">
            Cadastre um condomínio primeiro
          </h2>
          <p className="text-sm text-gray-500 mb-5 max-w-md mx-auto">
            Para criar a primeira assembleia, é preciso ter ao menos um
            condomínio cadastrado. Cadastre o condomínio e volte aqui.
          </p>
          <Link href="/admin/cadastro" className="btn-primary inline-flex">
            Cadastrar condomínio
          </Link>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Condomínio
          </label>
          <select
            value={form.condominio}
            onChange={(e) => setForm({ ...form, condominio: e.target.value })}
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
            Título
          </label>
          <input
            type="text"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="input-field"
            required
            maxLength={300}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descrição
          </label>
          <textarea
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="input-field"
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Início
            </label>
            <input
              type="datetime-local"
              value={form.data_inicio}
              onChange={(e) =>
                setForm({ ...form, data_inicio: e.target.value })
              }
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Encerramento
            </label>
            <input
              type="datetime-local"
              value={form.data_fim}
              onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              className="input-field"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quórum Mínimo — 1ª Chamada
            </label>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={form.primeira_chamada_50_mais_1}
                onChange={(e) =>
                  setForm({ ...form, primeira_chamada_50_mais_1: e.target.checked })
                }
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">50% + 1 (conforme lei)</span>
            </label>
            {!form.primeira_chamada_50_mais_1 && (
              <input
                type="number"
                value={form.quorum_minimo}
                onChange={(e) =>
                  setForm({ ...form, quorum_minimo: parseInt(e.target.value) || 0 })
                }
                className="input-field w-32"
                min={0}
                max={100}
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quórum Mínimo — 2ª Chamada
            </label>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={form.segunda_chamada_qualquer_numero}
                onChange={(e) =>
                  setForm({ ...form, segunda_chamada_qualquer_numero: e.target.checked })
                }
                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">Qualquer número dos presentes</span>
            </label>
            {!form.segunda_chamada_qualquer_numero && (
              <input
                type="number"
                value={form.quorum_segunda_chamada}
                onChange={(e) =>
                  setForm({ ...form, quorum_segunda_chamada: parseInt(e.target.value) || 0 })
                }
                className="input-field w-32"
                min={0}
                max={100}
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Donos de mais de uma unidade
          </label>
          <select
            value={form.modo_multiplas_unidades}
            onChange={(e) =>
              setForm({
                ...form,
                modo_multiplas_unidades: e.target.value as
                  | "sindico"
                  | "morador",
              })
            }
            className="input-field"
          >
            <option value="sindico">
              Síndico define antecipadamente (cota por unidade)
            </option>
            <option value="morador">
              Morador declara as outras unidades durante a votação
            </option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            No modo &quot;morador&quot;, cada unidade declarada vota
            separadamente e fica pendente até a sua validação.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Criando..." : "Criar Assembleia"}
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
      )}
    </div>
  );
}

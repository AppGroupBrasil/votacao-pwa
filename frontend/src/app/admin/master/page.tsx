"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Building2,
  CheckCircle,
  XCircle,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pencil,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { MasterDashboard, MasterUser, Condominio } from "@/lib/types";

export default function MasterPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<MasterDashboard | null>(null);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "condominios">("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<MasterUser | null>(null);
  const [editRole, setEditRole] = useState<"administradora" | "sindico">("sindico");
  const [editCondominios, setEditCondominios] = useState<string[]>([]);

  const loadAll = useCallback(async () => {
    try {
      const [d, u, c] = await Promise.all([
        api.masterDashboard(),
        api.masterUsers(),
        api.masterCondominios(),
      ]);
      setDashboard(d);
      setUsers(u);
      setCondominios(c);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        router.push("/admin/assembleias");
        return;
      }
      setError("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function toggleAdimplente(cond: Condominio) {
    try {
      const updated = await api.masterUpdateCondominio(cond.id, {
        adimplente: !cond.adimplente,
      });
      setCondominios((prev) =>
        prev.map((c) => (c.id === cond.id ? updated : c))
      );
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              condominios_adimplentes: prev.condominios_adimplentes + (updated.adimplente ? 1 : -1),
              condominios_inadimplentes: prev.condominios_inadimplentes + (updated.adimplente ? -1 : 1),
            }
          : prev
      );
    } catch {
      alert("Erro ao atualizar");
    }
  }

  async function toggleUserActive(u: MasterUser) {
    try {
      const updated = await api.masterUpdateUser(u.id, {
        is_active: !u.is_active,
      });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? updated : x)));
    } catch {
      alert("Erro ao atualizar usuário");
    }
  }

  async function deleteCondominio(cond: Condominio) {
    if (!confirm(`Excluir "${cond.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.masterDeleteCondominio(cond.id);
      setCondominios((prev) => prev.filter((c) => c.id !== cond.id));
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              total_condominios: prev.total_condominios - 1,
              condominios_adimplentes: prev.condominios_adimplentes - (cond.adimplente ? 1 : 0),
              condominios_inadimplentes: prev.condominios_inadimplentes - (!cond.adimplente ? 1 : 0),
            }
          : prev
      );
    } catch {
      alert("Erro ao excluir");
    }
  }

  async function deleteUser(u: MasterUser) {
    if (u.is_superuser) return;
    if (!confirm(`Excluir usuário "${u.username}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.masterDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setDashboard((prev) =>
        prev ? { ...prev, total_usuarios: prev.total_usuarios - 1 } : prev
      );
    } catch {
      alert("Erro ao excluir usuário");
    }
  }

  function openEditRole(u: MasterUser) {
    setEditingUser(u);
    setEditRole(u.role === "administradora" ? "administradora" : "sindico");
    setEditCondominios(u.condominios_ids || []);
  }

  async function saveRole() {
    if (!editingUser) return;
    try {
      const updated = await api.masterUpdateUser(editingUser.id, {
        role: editRole,
        condominios_ids: editCondominios,
      });
      setUsers((prev) => prev.map((x) => (x.id === editingUser.id ? updated : x)));
      setEditingUser(null);
    } catch {
      alert("Erro ao salvar perfil");
    }
  }

  function toggleCondominio(condId: string) {
    setEditCondominios((prev) =>
      prev.includes(condId)
        ? prev.filter((c) => c !== condId)
        : [...prev, condId]
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Carregando painel master...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-7 h-7 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel Master</h1>
          <p className="text-sm text-gray-500">
            Gerencie todos os cadastros, condomínios e status de adimplência
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Usuários"
            value={dashboard.total_usuarios}
            icon={<Users className="w-5 h-5 text-blue-600" />}
            bg="bg-blue-50"
          />
          <StatCard
            label="Condomínios"
            value={dashboard.total_condominios}
            icon={<Building2 className="w-5 h-5 text-indigo-600" />}
            bg="bg-indigo-50"
          />
          <StatCard
            label="Adimplentes"
            value={dashboard.condominios_adimplentes}
            icon={<CheckCircle className="w-5 h-5 text-green-600" />}
            bg="bg-green-50"
          />
          <StatCard
            label="Inadimplentes"
            value={dashboard.condominios_inadimplentes}
            icon={<XCircle className="w-5 h-5 text-red-600" />}
            bg="bg-red-50"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(["overview", "condominios", "users"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "overview"
              ? "Visão Geral"
              : t === "condominios"
              ? "Condomínios"
              : "Usuários"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Recent Condominios */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Condomínios Recentes</h3>
            {condominios.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum condomínio cadastrado</p>
            ) : (
              <div className="space-y-2">
                {condominios.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                      <p className="text-xs text-gray-400">{c.cnpj}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.adimplente
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {c.adimplente ? "Adimplente" : "Inadimplente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Users */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Usuários Recentes</h3>
            {users.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum usuário cadastrado</p>
            ) : (
              <div className="space-y-2">
                {users.slice(0, 5).map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.first_name} {u.last_name}
                      </p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {u.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "condominios" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">CNPJ</th>
                  <th className="text-center px-4 py-3 font-medium">Unidades</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {condominios.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{c.cnpj}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{c.total_unidades}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                          c.adimplente
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {c.adimplente ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {c.adimplente ? "Adimplente" : "Inadimplente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => toggleAdimplente(c)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.adimplente
                              ? "text-green-600 hover:bg-green-50"
                              : "text-red-600 hover:bg-red-50"
                          }`}
                          title={c.adimplente ? "Marcar como inadimplente" : "Marcar como adimplente"}
                        >
                          {c.adimplente ? (
                            <ToggleRight className="w-5 h-5" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => deleteCondominio(c)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Excluir condomínio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {condominios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-400">
                      Nenhum condomínio cadastrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Username</th>
                  <th className="text-center px-4 py-3 font-medium">Perfil</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-center px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">{u.username}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          u.role === "master"
                            ? "bg-purple-100 text-purple-700"
                            : u.role === "administradora"
                            ? "bg-blue-100 text-blue-700"
                            : u.role === "sindico"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {u.role === "master"
                          ? "Master"
                          : u.role === "administradora"
                          ? "Administradora"
                          : u.role === "sindico"
                          ? "Síndico"
                          : "Sem perfil"}
                      </span>
                      {u.role && u.role !== "master" && u.total_condominios > 0 && (
                        <span className="block text-[10px] text-gray-400 mt-0.5">
                          {u.total_condominios} cond.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          u.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {u.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {!u.is_superuser && (
                          <>
                            <button
                              onClick={() => openEditRole(u)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar perfil e condomínios"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleUserActive(u)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.is_active
                                  ? "text-green-600 hover:bg-green-50"
                                  : "text-gray-400 hover:bg-gray-100"
                              }`}
                              title={u.is_active ? "Desativar" : "Ativar"}
                            >
                              {u.is_active ? (
                                <ToggleRight className="w-5 h-5" />
                              ) : (
                                <ToggleLeft className="w-5 h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteUser(u)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {u.is_superuser && (
                          <span className="text-xs text-gray-400">Protegido</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Edit Role Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Editar Perfil — {editingUser.first_name || editingUser.username}
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role Select */}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Papel
            </label>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as "administradora" | "sindico")}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
            >
              <option value="administradora">Administradora</option>
              <option value="sindico">Síndico</option>
            </select>

            {/* Condominios Checkboxes */}
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Condomínios vinculados
            </label>
            <div className="max-h-52 overflow-y-auto border rounded-lg p-2 space-y-1 mb-4">
              {condominios.length === 0 ? (
                <p className="text-sm text-gray-400 p-2">Nenhum condomínio cadastrado</p>
              ) : (
                condominios.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={editCondominios.includes(c.id)}
                      onChange={() => toggleCondominio(c.id)}
                      className="rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">{c.nome}</span>
                  </label>
                ))
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={saveRole}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-gray-600">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

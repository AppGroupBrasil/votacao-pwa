"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User as UserIcon, Save, Trash2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function ContaPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    new_password: "",
  });

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setUser(u);
        setForm({
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          new_password: "",
        });
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const payload: Record<string, string> = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
      };
      if (form.new_password) {
        payload.new_password = form.new_password;
      }
      const updated = await api.updateMe(payload);
      setUser(updated);
      setForm((prev) => ({ ...prev, new_password: "" }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Erro ao salvar dados.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteMe();
      try { await api.logout(); } catch {}
      router.push("/login");
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Erro ao excluir conta.";
      setError(msg);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <UserIcon className="w-7 h-7 text-primary-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minha Conta</h1>
          <p className="text-sm text-gray-500">
            Edite seus dados pessoais ou exclua sua conta
          </p>
        </div>
      </div>

      {/* User info */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
          {(user?.first_name?.[0] || user?.username?.[0] || "?").toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900">
            {user?.first_name} {user?.last_name}
          </p>
          <p className="text-sm text-gray-500">@{user?.username}</p>
        </div>
        {user?.is_superuser && (
          <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
            Master
          </span>
        )}
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-lg">Dados Pessoais</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome
            </label>
            <input
              type="text"
              className="input"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sobrenome
            </label>
            <input
              type="text"
              className="input"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            type="text"
            className="input bg-gray-50 cursor-not-allowed"
            value={user?.username || ""}
            disabled
          />
          <p className="text-xs text-gray-400 mt-1">O username não pode ser alterado.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nova Senha <span className="text-gray-400 font-normal">(deixe em branco para manter a atual)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="input pr-10"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              minLength={8}
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {saved && (
          <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
            Dados salvos com sucesso!
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </form>

      {/* Delete account */}
      <div className="bg-white rounded-xl border border-red-200 p-6 space-y-4">
        <h2 className="font-semibold text-red-700 text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Zona de Perigo
        </h2>
        <p className="text-sm text-gray-600">
          A exclusão da conta é permanente e não pode ser desfeita. Todos os seus dados serão removidos.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Excluir Minha Conta
          </button>
        ) : (
          <div className="bg-red-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-red-800">
              Tem certeza? Esta ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Sim, Excluir"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

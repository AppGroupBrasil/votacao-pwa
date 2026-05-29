"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Vote, Eye, EyeOff, CheckCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function RedefinirSenhaPage() {
  const params = useParams();
  const uid = String(params.uid ?? "");
  const token = String(params.token ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await api.confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          "Não foi possível redefinir a senha. O link pode ter expirado."
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
        <div className="card w-full max-w-md text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Senha Redefinida</h1>
          <p className="text-gray-600 text-sm mb-6">
            Sua senha foi alterada com sucesso. Já pode entrar com a nova senha.
          </p>
          <Link href="/login" className="btn-primary w-full block text-center">
            Ir para o Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Vote className="w-8 h-8 text-primary-600" />
          <span className="font-bold text-xl">Votação Online</span>
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">Nova Senha</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Defina uma nova senha para sua conta.
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar senha
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input-field"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Salvando..." : "Redefinir Senha"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/login" className="text-primary-600 hover:underline">
            ← Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}

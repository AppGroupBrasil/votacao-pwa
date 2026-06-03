"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Vote } from "lucide-react";
import { api } from "@/lib/api";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function AutocadastroPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState("");
  const [condominioNome, setCondominioNome] = useState("");
  const [blocos, setBlocos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    bloco: "",
    apartamento: "",
    email: "",
  });

  useEffect(() => {
    api
      .getAutocadastro(token)
      .then((d) => {
        setCondominioNome(d.condominio_nome);
        setBlocos(d.blocos || []);
      })
      .catch((e: any) => {
        setError(
          e?.response?.data?.error ||
            "Autocadastro indisponível. Solicite o link ao síndico."
        );
      })
      .finally(() => setLoadingPage(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const cpf_hash = await sha256Hex(form.cpf);
      const res = await api.autocadastrar(token, {
        nome: form.nome,
        cpf_hash,
        bloco: form.bloco,
        apartamento: form.apartamento,
        email: form.email,
      });
      router.push(`/cadastro/${res.token}`);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.apartamento) {
        alert("Já existe um morador cadastrado neste apartamento.");
      } else if (data?.cpf_hash) {
        alert("Este CPF já está cadastrado.");
      } else if (data?.error) {
        alert(data.error);
      } else {
        alert("Erro ao enviar o cadastro. Confira os dados e tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadingPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card text-center max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4 py-8">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-2">
          <Vote className="w-7 h-7 text-primary-600" />
          <span className="font-bold text-lg">Votação Online</span>
        </div>
        <h1 className="text-xl font-bold text-center">Autocadastro</h1>
        <p className="text-sm text-gray-500 text-center mb-6">{condominioNome}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome completo
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
              CPF
            </label>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              className="input-field"
              placeholder="Somente números"
              inputMode="numeric"
              required
            />
          </div>
          {blocos.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bloco / Torre
              </label>
              <select
                value={form.bloco}
                onChange={(e) => setForm({ ...form, bloco: e.target.value })}
                className="input-field"
                required
              >
                <option value="">Selecione...</option>
                {blocos.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Apartamento / Unidade
            </label>
            <input
              type="text"
              value={form.apartamento}
              onChange={(e) => setForm({ ...form, apartamento: e.target.value })}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Enviando..." : "Continuar"}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Na próxima etapa você cadastra sua biometria para votar com segurança.
          </p>
        </form>
      </div>
    </div>
  );
}

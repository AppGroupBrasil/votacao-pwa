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

  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpEnviado, setOtpEnviado] = useState("");
  const [otpErro, setOtpErro] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  async function handleSolicitarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setOtpErro("");
    setOtpLoading(true);
    try {
      const res = await api.autocadastroJaCadastradoSolicitar(token, otpEmail);
      setOtpEnviado(res.email_masked);
    } catch (err: any) {
      setOtpErro(
        err?.response?.data?.error ||
          "Não foi possível enviar o código. Tente novamente."
      );
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleConfirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setOtpErro("");
    setOtpLoading(true);
    try {
      const res = await api.autocadastroJaCadastradoConfirmar(
        token,
        otpEmail,
        otpCode
      );
      router.push(`/cadastro/${res.token}`);
    } catch (err: any) {
      setOtpErro(err?.response?.data?.error || "Código inválido ou expirado.");
      setOtpLoading(false);
    }
  }

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
        <p className="text-sm text-gray-500 text-center mb-4">{condominioNome}</p>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            type="button"
            onClick={() => setModo("novo")}
            className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
              modo === "novo"
                ? "border-primary-600 bg-primary-50 text-primary-700"
                : "border-gray-200 text-gray-500"
            }`}
          >
            Sou novo aqui
          </button>
          <button
            type="button"
            onClick={() => setModo("existente")}
            className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
              modo === "existente"
                ? "border-primary-600 bg-primary-50 text-primary-700"
                : "border-gray-200 text-gray-500"
            }`}
          >
            Já sou cadastrado
          </button>
        </div>

        {modo === "existente" ? (
          <form
            onSubmit={otpEnviado ? handleConfirmarCodigo : handleSolicitarCodigo}
            className="space-y-4"
          >
            <p className="text-sm text-gray-500 text-center">
              Informe o e-mail cadastrado pela administração. Você recebe um
              código e cadastra sua biometria facial.
            </p>
            {otpErro && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">
                {otpErro}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                className="input-field"
                disabled={!!otpEnviado}
                required
              />
            </div>
            {otpEnviado && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código recebido por e-mail
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="input-field"
                  placeholder="6 dígitos"
                  inputMode="numeric"
                  maxLength={6}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Código enviado para {otpEnviado}. Vale por 10 minutos.
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={otpLoading}
              className="btn-primary w-full"
            >
              {otpLoading
                ? "Aguarde..."
                : otpEnviado
                ? "Confirmar e cadastrar biometria"
                : "Enviar código"}
            </button>
            {otpEnviado && (
              <button
                type="button"
                onClick={() => {
                  setOtpEnviado("");
                  setOtpCode("");
                  setOtpErro("");
                }}
                className="text-sm text-primary-600 w-full text-center"
              >
                Usar outro e-mail ou reenviar código
              </button>
            )}
          </form>
        ) : (
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
        )}
      </div>
    </div>
  );
}

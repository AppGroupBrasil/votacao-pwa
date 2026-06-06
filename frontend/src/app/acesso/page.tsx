"use client";

import { useState, useEffect } from "react";
import {
  Vote,
  Eye,
  EyeOff,
  Lock,
  Camera,
  Fingerprint,
  CheckCircle,
  Users,
  Video,
} from "lucide-react";

import dynamic from "next/dynamic";
import { api, type EleitorSession, type EleitorPresencaResponse } from "@/lib/api";

const FaceCapture = dynamic(() => import("@/components/FaceCapture"), {
  ssr: false,
});
const WebAuthnEnroll = dynamic(
  () => import("@/components/webauthn/WebAuthnEnroll"),
  { ssr: false }
);

const SALA_REUNIAO_URL = "https://meet.google.com/tdo-ziib-jkn";
const CONDOMINIO_CNPJ = "52.077.813/0001-83";

type Step = "login" | "cadastro" | "senha" | "biometria" | "presenca";

export default function AcessoMoradorPage() {
  const [step, setStep] = useState<Step>("login");
  const [session, setSession] = useState<EleitorSession | null>(null);
  const [token, setToken] = useState("");
  const [meuLogin, setMeuLogin] = useState("");

  // login
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // cadastro
  const [cNome, setCNome] = useState("");
  const [cBloco, setCBloco] = useState("");
  const [cApto, setCApto] = useState("");
  const [cSenha, setCSenha] = useState("");
  const [blocos, setBlocos] = useState<string[]>([]);

  useEffect(() => {
    if (step !== "cadastro" || blocos.length) return;
    api
      .eleitorCondominioInfo(CONDOMINIO_CNPJ)
      .then((info) => setBlocos(info.blocos || []))
      .catch(() => {});
  }, [step, blocos.length]);

  // troca de senha
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmaSenha, setConfirmaSenha] = useState("");

  // biometria
  const [usarDigital, setUsarDigital] = useState(false);

  // presença
  const [presenca, setPresenca] = useState<EleitorPresencaResponse | null>(null);

  function avancar(s: EleitorSession) {
    setSession(s);
    if (s.session_token) setToken(s.session_token);
    if (s.precisa_trocar_senha) setStep("senha");
    else if (s.precisa_biometria) setStep("biometria");
    else registrarPresenca(s.session_token || token);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const s = await api.eleitorLogin(login.trim(), senha);
      avancar(s);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (cSenha.length < 6) {
      setError("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const s = await api.eleitorCadastro({
        cnpj: CONDOMINIO_CNPJ,
        nome: cNome.trim(),
        bloco: cBloco.trim(),
        apartamento: cApto.trim(),
        senha: cSenha,
      });
      if (s.login) setMeuLogin(s.login);
      avancar(s);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao cadastrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (novaSenha.length < 6) {
      setError("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmaSenha) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const s = await api.eleitorTrocarSenha(token, novaSenha);
      if (s.precisa_biometria) setStep("biometria");
      else registrarPresenca(token);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao trocar a senha.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFacial(hash: string) {
    setError("");
    setLoading(true);
    try {
      await api.eleitorCadastrarBiometria(token, hash);
      registrarPresenca(token);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao salvar biometria.");
      setLoading(false);
    }
  }

  async function registrarPresenca(tok: string) {
    setError("");
    setLoading(true);
    try {
      const p = await api.eleitorPresenca(tok);
      setPresenca(p);
      setStep("presenca");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao registrar presença.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4 py-8">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Vote className="w-7 h-7 text-primary-600" />
          <span className="font-bold text-lg">Acesso do Morador</span>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {/* PASSO 1 — LOGIN */}
        {step === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <h1 className="text-xl font-bold text-center mb-2">Entrar</h1>
            <p className="text-sm text-gray-500 text-center mb-4">
              Use seu e-mail e senha cadastrados.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="input-field"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="input-field pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(!showSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-sm text-primary-900 mt-2">
              <p className="font-semibold mb-1">Já tem conta no Resolvido Condomínio?</p>
              <p>
                Acesse com o seu <strong>e-mail</strong> e a senha{" "}
                <strong>123456</strong>.
              </p>
            </div>

            <div className="text-center text-sm text-gray-600 pt-2">
              Ainda não tem cadastro?{" "}
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep("cadastro");
                }}
                className="text-primary-600 font-semibold hover:underline"
              >
                Clique aqui para se cadastrar
              </button>
            </div>

            <a
              href="https://wa.me/5581999618516"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full mt-2 py-2.5 px-4 rounded-lg border border-green-500 text-green-700 bg-green-50 hover:bg-green-100 transition-colors text-sm font-semibold"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-green-600" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              Falar pelo WhatsApp
            </a>
          </form>
        )}

        {/* PASSO 1B — CADASTRO */}
        {step === "cadastro" && (
          <form onSubmit={handleCadastro} className="space-y-4">
            <h1 className="text-xl font-bold text-center mb-1">Criar cadastro</h1>
            <p className="text-sm text-gray-500 text-center mb-2">
              Preencha seus dados. O condomínio já está identificado.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome completo
              </label>
              <input
                type="text"
                value={cNome}
                onChange={(e) => setCNome(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bloco
                </label>
                <select
                  value={cBloco}
                  onChange={(e) => setCBloco(e.target.value)}
                  className="input-field"
                  required={blocos.length > 0}
                >
                  <option value="">Selecione</option>
                  {blocos.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apartamento
                </label>
                <input
                  type="text"
                  value={cApto}
                  onChange={(e) => setCApto(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Crie uma senha
              </label>
              <input
                type="password"
                value={cSenha}
                onChange={(e) => setCSenha(e.target.value)}
                className="input-field"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Cadastrando..." : "Cadastrar e continuar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep("login");
              }}
              className="text-sm text-gray-500 hover:text-gray-700 w-full text-center"
            >
              Voltar para o login
            </button>
          </form>
        )}

        {/* PASSO 2 — TROCA DE SENHA */}
        {step === "senha" && (
          <form onSubmit={handleTrocarSenha} className="space-y-4">
            <Lock className="w-10 h-10 text-primary-600 mx-auto" />
            <h1 className="text-xl font-bold text-center">Crie uma nova senha</h1>
            <p className="text-sm text-gray-500 text-center mb-2">
              Por segurança, defina uma senha pessoal antes de continuar.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nova senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="input-field"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirme a senha
              </label>
              <input
                type="password"
                value={confirmaSenha}
                onChange={(e) => setConfirmaSenha(e.target.value)}
                className="input-field"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Salvando..." : "Salvar e continuar"}
            </button>
          </form>
        )}

        {/* PASSO 3 — BIOMETRIA */}
        {step === "biometria" && session && (
          <div className="space-y-4">
            {!usarDigital ? (
              <>
                <Camera className="w-10 h-10 text-primary-600 mx-auto" />
                <h1 className="text-xl font-bold text-center">
                  Cadastre sua biometria facial
                </h1>
                <p className="text-sm text-gray-500 text-center">
                  Ela será usada para confirmar sua identidade ao votar.
                </p>
                <FaceCapture eleitorId={session.eleitor_id} onCapture={handleFacial} />
                <button
                  onClick={() => setUsarDigital(true)}
                  className="text-sm text-gray-500 hover:text-gray-700 w-full text-center flex items-center justify-center gap-1"
                >
                  <Fingerprint className="w-4 h-4" />
                  Recusar facial — usar digital / PIN
                </button>
              </>
            ) : (
              <>
                <WebAuthnEnroll
                  eleitorId={session.eleitor_id}
                  onSuccess={() => registrarPresenca(token)}
                />
                <button
                  onClick={() => setUsarDigital(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 w-full text-center flex items-center justify-center gap-1"
                >
                  <Camera className="w-4 h-4" />
                  Voltar para reconhecimento facial
                </button>
              </>
            )}
          </div>
        )}

        {/* PASSO 4 — PRESENÇA */}
        {step === "presenca" && presenca && (
          <div className="space-y-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-bold text-center">Presença registrada</h1>
            <p className="text-sm text-gray-500 text-center">
              {presenca.assembleia_titulo}
            </p>

            {meuLogin && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 text-center">
                Guarde seu login para os próximos acessos:
                <br />
                <strong className="break-all">{meuLogin}</strong>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mt-4">
              <Users className="w-4 h-4" />
              Lista de presença ({presenca.total_presentes})
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border divide-y">
              {presenca.presencas.map((p, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 text-sm flex justify-between ${
                    p.eu ? "bg-primary-50 font-semibold" : ""
                  }`}
                >
                  <span>
                    {p.nome}
                    {p.eu && " (você)"}
                  </span>
                  <span className="text-gray-500">
                    {p.bloco ? `${p.bloco}-` : ""}
                    {p.apartamento}
                  </span>
                </div>
              ))}
            </div>

            {presenca.assembleia_id && (
              <a
                href={`/votacao/${presenca.assembleia_id}?eleitor=${session?.eleitor_id || ""}`}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Vote className="w-4 h-4" />
                Ir para a votação
              </a>
            )}

            <a
              href={SALA_REUNIAO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" />
              Acessar sala da reunião online
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

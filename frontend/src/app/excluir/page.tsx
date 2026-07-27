"use client";

import { useState } from "react";
import { Vote, Trash2, CheckCircle2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function ExcluirCadastroPage() {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [condominio, setCondominio] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirma, setConfirma] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function enviar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe seu nome completo.");
      return;
    }
    if (!cpf.trim() && !email.trim()) {
      setErro("Informe o CPF ou o e-mail cadastrado para localizarmos seu cadastro.");
      return;
    }
    if (!confirma) {
      setErro("Confirme que você é o titular dos dados.");
      return;
    }
    setEnviando(true);
    try {
      await api.solicitarExclusao({
        nome: nome.trim(),
        cpf: cpf.trim(),
        email: email.trim(),
        condominio: condominio.trim(),
        motivo: motivo.trim(),
      });
      setEnviado(true);
    } catch (e: any) {
      setErro(
        e?.response?.data?.error ||
          "Não foi possível enviar o pedido. Tente novamente."
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="max-w-3xl mx-auto px-6 pt-6 pb-28">
          <div className="flex items-center gap-2 mb-10">
            <Vote className="w-6 h-6" />
            <span className="font-bold">Votação Online</span>
          </div>
          <div className="text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-wide text-primary-200">
              Privacidade · LGPD
            </p>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              Excluir meu cadastro
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 -mt-16 pb-16">
        <div className="mx-auto max-w-md card">
          {enviado ? (
            <div className="text-center py-4">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" />
              <h2 className="text-lg font-bold">Pedido recebido</h2>
              <p className="mt-2 text-sm text-gray-600">
                Recebemos seu pedido de exclusão. Seus dados pessoais serão
                removidos em até 7 dias, conforme a LGPD. Você não precisa fazer
                mais nada.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <Trash2 className="h-5 w-5 text-primary-600" />
                </span>
                <p className="text-sm text-gray-600">
                  Preencha para solicitar a exclusão do seu cadastro e dos seus
                  dados pessoais (nome, unidade, selfie, assinatura e votos de
                  identificação).
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Nome completo
                  </label>
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="input-field w-full"
                    placeholder="Seu nome"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">CPF</label>
                  <input
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    inputMode="numeric"
                    className="input-field w-full"
                    placeholder="Somente números"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    E-mail
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    className="input-field w-full"
                    placeholder="E-mail cadastrado (opcional)"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Informe o CPF ou o e-mail para localizarmos seu cadastro.
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Condomínio
                  </label>
                  <input
                    value={condominio}
                    onChange={(e) => setCondominio(e.target.value)}
                    className="input-field w-full"
                    placeholder="Nome do condomínio (opcional)"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Motivo (opcional)
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={2}
                    className="input-field w-full"
                    placeholder="Se quiser, conte o motivo"
                  />
                </div>

                <label className="flex items-start gap-2 pt-1 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={confirma}
                    onChange={(e) => setConfirma(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    Confirmo que sou o titular destes dados e desejo a exclusão
                    do meu cadastro.
                  </span>
                </label>
              </div>

              {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

              <button
                onClick={enviar}
                disabled={enviando}
                className="btn-primary mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
                {enviando ? "Enviando..." : "Solicitar exclusão"}
              </button>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Seu pedido é tratado
                conforme a LGPD.
              </p>
            </>
          )}
        </div>
      </main>

      <footer className="bg-gray-900 py-6 text-center text-xs text-gray-400">
        © 2026 Votação Online
      </footer>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { Mail, Loader2, CheckCircle, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";

type Status = "email" | "sending" | "awaiting-code" | "verifying" | "success";

interface IdentificacaoEmailProps {
  assembleiaId: string;
  onSuccess: (token: string, eleitorId: string, votosPermitidos: number) => void;
}

export default function IdentificacaoEmail({
  assembleiaId,
  onSuccess,
}: IdentificacaoEmailProps) {
  const [status, setStatus] = useState<Status>("email");
  const [email, setEmail] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (status === "awaiting-code") inputRefs.current[0]?.focus();
  }, [status]);

  async function handleSendOtp() {
    if (!email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    setError("");
    setStatus("sending");
    try {
      const result = await api.otpSendEmail(email.trim(), assembleiaId);
      setEmailMasked(result.email_masked);
      setCode(["", "", "", "", "", ""]);
      setStatus("awaiting-code");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Erro ao enviar código.");
      setStatus("email");
    }
  }

  async function handleVerify(fullCode: string) {
    setError("");
    setStatus("verifying");
    try {
      const result = await api.otpVerifyEmail(email.trim(), assembleiaId, fullCode);
      setStatus("success");
      setTimeout(
        () => onSuccess(result.token, result.eleitor_id, result.votos_permitidos || 1),
        800
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || "Código inválido ou expirado.");
      setStatus("awaiting-code");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    if (digit && index === 5) {
      const full = newCode.join("");
      if (full.length === 6) handleVerify(full);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      inputRefs.current[5]?.focus();
      handleVerify(pasted);
    }
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="font-semibold text-lg">Identidade Confirmada</h3>
      </div>
    );
  }

  if (status === "email" || status === "sending") {
    return (
      <div className="text-center space-y-4">
        <Mail className="w-12 h-12 text-primary-600 mx-auto" />
        <h3 className="font-semibold text-lg">Identifique-se</h3>
        <p className="text-sm text-gray-500">
          Digite o e-mail cadastrado. Enviaremos um código de 6 dígitos para
          confirmar sua identidade — sem precisar de login.
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
          placeholder="seu@email.com"
          disabled={status === "sending"}
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none transition-colors"
        />

        <button
          onClick={handleSendOtp}
          disabled={status === "sending"}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {status === "sending" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" /> Enviar Código
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <Mail className="w-12 h-12 text-primary-600 mx-auto" />
      <h3 className="font-semibold text-lg">Digite o Código</h3>
      <p className="text-sm text-gray-500">
        Enviado para <span className="font-medium">{emailMasked}</span>
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {code.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={status === "verifying"}
            className="w-11 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-lg focus:border-primary-500 focus:outline-none transition-colors disabled:opacity-50"
          />
        ))}
      </div>

      {status === "verifying" && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
        </div>
      )}

      <button
        onClick={handleSendOtp}
        disabled={status === "verifying"}
        className="text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
      >
        <RotateCcw className="w-3 h-3" /> Reenviar código
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ShieldCheck, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  isWebAuthnSupported,
  authenticateCredential,
} from "@/lib/webauthn";

type Status = "idle" | "authenticating" | "success" | "error" | "unsupported";

interface WebAuthnVerifyProps {
  eleitorId: string;
  assembleiaId: string;
  onSuccess: (token: string, votos?: number) => void;
  onFallback?: () => void;
}

export default function WebAuthnVerify({
  eleitorId,
  assembleiaId,
  onSuccess,
  onFallback,
}: WebAuthnVerifyProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleVerify() {
    setError("");

    if (!isWebAuthnSupported()) {
      setStatus("unsupported");
      return;
    }

    try {
      setStatus("authenticating");

      // 1. Get authentication options from server (includes allowCredentials list)
      const serverOptions = await api.webauthnAuthOptions(eleitorId);

      // 2. Browser reads the credential (fingerprint / face / PIN)
      const assertion = await authenticateCredential(serverOptions);

      // 3. Send assertion to server for verification — returns a voting token
      const { token, votos_permitidos } = await api.webauthnAuthVerify(
        eleitorId,
        assembleiaId,
        assertion
      );

      setStatus("success");
      setTimeout(() => onSuccess(token, votos_permitidos), 1000);
    } catch (err: any) {
      console.error("[WebAuthn] Auth failed:", err);

      // User cancelled the ceremony  
      if (err?.name === "NotAllowedError") {
        setStatus("idle");
        return;
      }

      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Erro na autenticação WebAuthn";
      setError(msg);
      setStatus("error");
    }
  }

  if (status === "unsupported") {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <p className="text-sm text-gray-500">
          WebAuthn não disponível neste navegador.
        </p>
        {onFallback && (
          <button onClick={onFallback} className="btn-secondary">
            Usar outro método
          </button>
        )}
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
        <h3 className="font-semibold text-lg">Identidade Confirmada</h3>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <ShieldCheck className="w-12 h-12 text-primary-600 mx-auto" />
      <h3 className="font-semibold text-lg">Verificação Biométrica</h3>
      <p className="text-sm text-gray-500">
        Confirme sua identidade com a biometria do dispositivo para votar.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <button
        onClick={handleVerify}
        disabled={status === "authenticating"}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {status === "authenticating" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Aguardando biometria...
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4" />
            Verificar Identidade
          </>
        )}
      </button>

      {onFallback && status !== "authenticating" && (
        <button
          onClick={onFallback}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Usar outro método de autenticação
        </button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Vote } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export default function SsoPage() {
  const router = useRouter();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setErro(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/sso/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        if (!res.ok) throw new Error("sso");
        router.replace("/admin");
      } catch {
        setErro(true);
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-4">
      <div className="card w-full max-w-md text-center">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Vote className="w-8 h-8 text-primary-600" />
          <span className="font-bold text-xl">Votação Online</span>
        </div>
        {erro ? (
          <>
            <h1 className="text-xl font-bold mb-2">Não foi possível entrar</h1>
            <p className="text-sm text-gray-600 mb-6">
              O link de acesso expirou ou é inválido. Volte ao painel do
              condomínio e clique novamente no aplicativo.
            </p>
            <a href="/login" className="btn-primary w-full block text-center">
              Ir para o login
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold mb-2">Entrando…</h1>
            <p className="text-sm text-gray-600">
              Conectando você ao seu condomínio com segurança.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

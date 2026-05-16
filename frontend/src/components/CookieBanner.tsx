"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie-consent-v1";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function aceitar() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, at: new Date().toISOString() }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-lg p-4 sm:p-5"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p className="text-sm text-gray-700 flex-1">
          Usamos apenas cookies essenciais para autenticação e funcionamento do
          sistema. Não rastreamos para fins publicitários. Veja a{" "}
          <Link href="/privacidade" className="text-primary-600 underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <button
          onClick={aceitar}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 whitespace-nowrap"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

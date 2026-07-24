"use client";

import { useState } from "react";
import { Copy, Check, Eye } from "lucide-react";

/**
 * Bloco de destaque para compartilhar o link curto (/v/<codigo>) no chat do
 * Google Meet / Zoom, com dois botões grandes e responsivos:
 *  - "Copiar link para o chat" (laranja, bem chamativo)
 *  - "Ver como morador" (âmbar, abre a página do morador em nova aba)
 * Empilha no celular e quebra linha, então nunca estoura a margem da tela.
 */
export default function LinkDestaque({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback para navegadores sem acesso à área de transferência.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignora */
      }
      document.body.removeChild(ta);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div
      className={`flex flex-col sm:flex-row flex-wrap items-stretch gap-2 ${className}`}
    >
      <button
        type="button"
        onClick={copiar}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-sm ring-1 ring-orange-600/30 transition hover:bg-orange-600 active:scale-[0.98]"
      >
        {copiado ? (
          <>
            <Check className="w-5 h-5 shrink-0" /> Link copiado!
          </>
        ) : (
          <>
            <Copy className="w-5 h-5 shrink-0" /> Copiar link para o chat
          </>
        )}
      </button>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm ring-1 ring-amber-500/40 transition hover:bg-amber-300 active:scale-[0.98]"
      >
        <Eye className="w-5 h-5 shrink-0" /> Ver como morador
      </a>

      <span className="min-w-0 inline-flex flex-1 items-center truncate rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-500 ring-1 ring-gray-200">
        {url}
      </span>
    </div>
  );
}

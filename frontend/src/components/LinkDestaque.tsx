"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Share2 } from "lucide-react";

/**
 * Bloco de destaque para compartilhar o link curto (/v/<codigo>) no chat do
 * Google Meet / Zoom, com botões grandes e responsivos:
 *  - "Copiar link para o chat" (laranja, bem chamativo)
 *  - Abrir a página em nova aba (âmbar) — rótulo via `abrirLabel`
 *  - "Compartilhar" (verde) — usa o menu nativo do celular (WhatsApp etc.);
 *    onde não houver, cai no copiar.
 * Empilha no celular e quebra linha, então nunca estoura a margem da tela.
 */
export default function LinkDestaque({
  url,
  abrirLabel = "Ver como morador",
  shareTitle = "",
  className = "",
}: {
  url: string;
  abrirLabel?: string;
  shareTitle?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(url);
      return;
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
  }

  async function copiar() {
    await copiarTexto();
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function compartilhar() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: shareTitle || undefined, url });
        return;
      } catch {
        // Usuário cancelou ou o compartilhamento falhou: cai no copiar.
      }
    }
    await copiar();
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
        <ExternalLink className="w-5 h-5 shrink-0" /> {abrirLabel}
      </a>

      <button
        type="button"
        onClick={compartilhar}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-sm ring-1 ring-green-700/30 transition hover:bg-green-700 active:scale-[0.98]"
      >
        <Share2 className="w-5 h-5 shrink-0" /> Compartilhar
      </button>

      <span className="min-w-0 inline-flex flex-1 items-center truncate rounded-lg bg-white/70 px-3 py-2 text-xs text-gray-500 ring-1 ring-gray-200">
        {url}
      </span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, Lock } from "lucide-react";
import {
  POR_QUE_FECHO,
  POR_QUE_INTRO,
  POR_QUE_ITENS,
  POR_QUE_TITULO,
  textoRegra,
} from "@/lib/regraCadastro";

/** A explicação do porquê, em lista curta. */
export function PorQueCadastroAntecipado() {
  return (
    <div className="text-sm text-gray-700">
      <p className="mb-1.5">{POR_QUE_INTRO}</p>
      <ul className="mb-2 space-y-1 pl-1">
        {POR_QUE_ITENS.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p>{POR_QUE_FECHO}</p>
    </div>
  );
}

/**
 * Aviso da regra de cadastro antecipado para o morador. Laranja enquanto o
 * cadastro está aberto (mostra o prazo), vermelho quando já fechou.
 */
export default function RegraCadastroAviso({
  prazo,
  fechado,
  porqueAberto = false,
}: {
  prazo: string | Date;
  fechado: boolean;
  porqueAberto?: boolean;
}) {
  const [abrir, setAbrir] = useState(porqueAberto);
  const { titulo, texto } = textoRegra(prazo, fechado);
  const Icone = fechado ? Lock : CalendarClock;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        fechado ? "border-red-200 bg-red-50" : "border-amber-300 bg-amber-50"
      }`}
    >
      <p
        className={`flex items-center gap-2 text-sm font-semibold ${
          fechado ? "text-red-800" : "text-amber-900"
        }`}
      >
        <Icone className="h-4 w-4 shrink-0" />
        {titulo}
      </p>
      <p className={`mt-1 text-sm ${fechado ? "text-red-800" : "text-amber-900"}`}>{texto}</p>

      {porqueAberto ? (
        <div className="mt-3 border-t border-black/5 pt-3">
          <p className="mb-1 text-sm font-semibold text-gray-900">{POR_QUE_TITULO}</p>
          <PorQueCadastroAntecipado />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAbrir((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-700 underline underline-offset-2"
          >
            {POR_QUE_TITULO}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abrir ? "rotate-180" : ""}`} />
          </button>
          {abrir && (
            <div className="mt-2">
              <PorQueCadastroAntecipado />
            </div>
          )}
        </>
      )}
    </div>
  );
}

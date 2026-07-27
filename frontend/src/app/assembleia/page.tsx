"use client";

import { useState } from "react";
import { Vote, ClipboardList, Video, Lock } from "lucide-react";

const NOME_CONDOMINIO = "San Residence";
const LINK_LISTA_PRESENCA = "https://appvotacao.com.br/v/G5B";
const LINK_MEET = "https://meet.google.com/xjx-zyrh-bhw";

export default function SalaAssembleiaPage() {
  const [preencheu, setPreencheu] = useState(false);

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
              Assembleia online
            </p>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight">
              {NOME_CONDOMINIO}
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 -mt-16 pb-16">
        <div className="mx-auto max-w-md card">
          <div className="space-y-7">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <ClipboardList className="h-6 w-6 text-primary-600" />
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                    1
                  </span>
                </span>
                <div>
                  <h2 className="font-semibold">Lista de presença</h2>
                  <p className="text-sm text-gray-500">
                    Preencha para liberar a sala de votação.
                  </p>
                </div>
              </div>
              <a
                href={LINK_LISTA_PRESENCA || undefined}
                target="_blank"
                rel="noreferrer"
                onClick={() => setPreencheu(true)}
                className="btn-primary flex w-full items-center justify-center gap-2"
              >
                <ClipboardList className="h-5 w-5" /> Preencher lista de presença
              </a>
            </div>

            <div className="border-t border-dashed border-gray-200" />

            <div className={preencheu ? "" : "opacity-70"}>
              <div className="mb-3 flex items-center gap-3">
                <span
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                    preencheu ? "bg-primary-100" : "bg-gray-100"
                  }`}
                >
                  <Video
                    className={`h-6 w-6 ${
                      preencheu ? "text-primary-600" : "text-gray-400"
                    }`}
                  />
                  <span
                    className={`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${
                      preencheu ? "bg-primary-600" : "bg-gray-300"
                    }`}
                  >
                    2
                  </span>
                </span>
                <div>
                  <h2 className="font-semibold">Assembleia online</h2>
                  <p className="text-sm text-gray-500">
                    {preencheu
                      ? "Tudo pronto — entre na reunião."
                      : "Disponível após enviar a lista."}
                  </p>
                </div>
              </div>
              {preencheu ? (
                <a
                  href={LINK_MEET || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary flex w-full items-center justify-center gap-2"
                >
                  <Video className="h-5 w-5" /> Acessar assembleia online
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 font-semibold text-gray-400"
                >
                  <Lock className="h-4 w-4" /> Acessar assembleia online
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-md text-center text-xs text-gray-400">
          Preencha a lista de presença e volte a esta página para entrar na
          assembleia.
        </p>
      </main>

      <footer className="bg-gray-900 py-6 text-center text-xs text-gray-400">
        © 2026 Votação Online
      </footer>
    </div>
  );
}

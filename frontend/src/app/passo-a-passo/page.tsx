"use client";

import { useEffect, useState } from "react";
import {
  Vote,
  ClipboardList,
  Video,
  MessageSquare,
  CheckSquare,
  Printer,
} from "lucide-react";

// Valores padrão desta assembleia. Para reaproveitar em outro condomínio,
// basta trocar aqui — ou passar pela URL:
// /passo-a-passo?cond=Nome&link=https://appvotacao.com.br/assembleia
const DEFAULTS = {
  cond: "San Residence",
  link: "https://appvotacao.com.br/assembleia",
  votacao: "https://appvotacao.com.br/v/EY3",
};

function LinkBox({ url }: { url: string }) {
  if (!url) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400">
        (informe o link)
      </p>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block break-all rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700"
    >
      {url}
    </a>
  );
}

export default function PassoAPassoPage() {
  const [cfg, setCfg] = useState(DEFAULTS);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setCfg({
      cond: q.get("cond") || DEFAULTS.cond,
      link: q.get("link") || DEFAULTS.link,
      votacao: q.get("votacao") || DEFAULTS.votacao,
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <style>{`@media print {
        html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
        .step-card { box-shadow: none !important; page-break-inside: avoid; }
      }`}</style>

      <header className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="mx-auto max-w-2xl px-6 pb-24 pt-6 print:pb-10">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Vote className="h-6 w-6" />
              <span className="font-bold">Votação Online</span>
            </div>
            <button
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25"
            >
              <Printer className="h-4 w-4" /> Baixar PDF
            </button>
          </div>
          <p className="mb-2 text-sm font-medium uppercase tracking-wide text-primary-200">
            Assembleia Online · Passo a passo
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">
            {cfg.cond}
          </h1>
          <p className="mt-2 text-primary-200">
            Siga os passos abaixo para participar da assembleia do seu
            condomínio.
          </p>
        </div>
      </header>

      <main className="-mt-14 px-4 pb-16 print:mt-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Passo 1 */}
          <div className="step-card card flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 font-bold text-white">
              1
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary-600" />
                <h2 className="font-bold">Acesse a assembleia e preencha a presença</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Abra o endereço abaixo e preencha a lista de presença com as suas
                informações (nome, unidade e assinatura).
              </p>
              <LinkBox url={cfg.link} />
            </div>
          </div>

          {/* Passo 2 */}
          <div className="step-card card flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 font-bold text-white">
              2
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary-600" />
                <h2 className="font-bold">Entre na sala da assembleia</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Ao terminar de preencher, você será encaminhado para a sala da
                Assembleia Online.
              </p>
            </div>
          </div>

          {/* Passo 3 */}
          <div className="step-card card flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 font-bold text-white">
              3
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary-600" />
                <h2 className="font-bold">Acesse a votação</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                A votação de cada um dos tópicos estará disponível no chat da
                sala da Assembleia. Você também pode acessar pelo link:
              </p>
              <LinkBox url={cfg.votacao} />
            </div>
          </div>

          {/* Passo 4 */}
          <div className="step-card card flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 font-bold text-white">
              4
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary-600" />
                <h2 className="font-bold">Vote quando cada tópico for liberado</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                No momento da votação, cada tópico será liberado quando for a
                hora — assim que o síndico ou a administradora liberar. Aguarde a
                liberação e registre o seu voto.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-900 py-6 text-center text-xs text-gray-400 print:bg-white print:text-gray-500">
        © 2026 Votação Online
      </footer>
    </div>
  );
}

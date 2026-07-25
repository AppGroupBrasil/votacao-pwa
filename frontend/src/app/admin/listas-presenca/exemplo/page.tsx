import Link from "next/link";
import { ArrowLeft, Users, Info } from "lucide-react";

const FUSO_BRASILIA = "America/Sao_Paulo";

function dataHoraBrasilia(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO_BRASILIA });
}

type Exemplo = {
  nome: string;
  perfil: string;
  bloco: string;
  apartamento: string;
  metodo: string;
  aparelho: string;
  ip: string;
  criado_em: string;
};

const PERFIL_LABEL: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  conjuge: "Cônjuge",
  procurador: "Procurador",
  outro: "Outro",
};

const METODO_LABEL: Record<string, string> = {
  facial: "Biometria facial",
  webauthn: "Digital do aparelho",
  otp: "Código por e-mail",
};

// Lista 100% fictícia — nomes de artistas, escritores e músicos brasileiros,
// só para o síndico ver como fica uma lista de presença preenchida, já com os
// dados de segurança (identificação, aparelho e IP).
const REGISTROS: Exemplo[] = [
  { nome: "Machado de Assis", perfil: "proprietario", bloco: "A", apartamento: "101", metodo: "facial", aparelho: "Android / Chrome", ip: "189.40.12.7", criado_em: "2026-07-25T19:31:00-03:00" },
  { nome: "Clarice Lispector", perfil: "proprietario", bloco: "A", apartamento: "102", metodo: "facial", aparelho: "iPhone / Safari", ip: "201.17.88.204", criado_em: "2026-07-25T19:33:00-03:00" },
  { nome: "Carlos Drummond de Andrade", perfil: "locatario", bloco: "A", apartamento: "204", metodo: "webauthn", aparelho: "Android / Chrome", ip: "179.201.5.66", criado_em: "2026-07-25T19:35:00-03:00" },
  { nome: "Tom Jobim", perfil: "proprietario", bloco: "B", apartamento: "301", metodo: "facial", aparelho: "iPhone / Safari", ip: "191.240.33.19", criado_em: "2026-07-25T19:38:00-03:00" },
  { nome: "Elis Regina", perfil: "conjuge", bloco: "B", apartamento: "302", metodo: "otp", aparelho: "Windows / Edge", ip: "177.92.140.8", criado_em: "2026-07-25T19:40:00-03:00" },
  { nome: "Tarsila do Amaral", perfil: "proprietario", bloco: "B", apartamento: "405", metodo: "facial", aparelho: "Android / Chrome", ip: "186.212.9.145", criado_em: "2026-07-25T19:42:00-03:00" },
  { nome: "Cartola", perfil: "procurador", bloco: "C", apartamento: "12", metodo: "webauthn", aparelho: "Android / Chrome", ip: "200.155.71.30", criado_em: "2026-07-25T19:45:00-03:00" },
  { nome: "Cecília Meireles", perfil: "locatario", bloco: "C", apartamento: "21", metodo: "otp", aparelho: "iPhone / Safari", ip: "189.5.44.212", criado_em: "2026-07-25T19:47:00-03:00" },
  { nome: "Pixinguinha", perfil: "proprietario", bloco: "C", apartamento: "33", metodo: "facial", aparelho: "Android / Chrome", ip: "187.66.200.101", criado_em: "2026-07-25T19:50:00-03:00" },
];

// Retrato em traço preto (estilo desenho a lápis), só para mostrar que naquele
// lugar fica o ROSTO (a selfie) do morador — e não o nome. Não representa
// ninguém: pequenas variações fazem cada linha parecer uma pessoa diferente.
function RostoSketch({ variante }: { variante: number }) {
  const v = ((variante % 6) + 6) % 6;
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-full w-full"
      fill="none"
      stroke="#111827"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* ombros e pescoço */}
      <path d="M12 60 C14 47 22 44 32 44 C42 44 50 47 52 60" />
      <path d="M28 35 v6 M36 35 v6" />
      {/* cabeça */}
      <circle cx="32" cy="24" r="11" />
      {/* olhos, nariz e boca */}
      <path d="M26 22 h3 M35 22 h3" />
      <path d="M31.5 24 v3 M31.5 27 h1.5" />
      <path d="M29 30 q3 2.5 6 0" />
      {/* cabelo/acessório — varia por pessoa */}
      {v === 0 && <path d="M21 21 C22 11 42 11 43 21" />}
      {v === 1 && (
        <>
          <path d="M21 22 C19 11 45 11 43 22" />
          <circle cx="45" cy="15" r="4" />
        </>
      )}
      {v === 2 && <path d="M23 19 q9 -11 18 0" strokeDasharray="2 3" />}
      {v === 3 && <path d="M20 22 q1 -11 12 -11 q11 0 12 11" />}
      {v === 4 && <path d="M19 20 h26 M23 20 v-3 h18 v3" />}
      {v === 5 && (
        <>
          <path d="M21 21 C22 11 42 11 43 21" />
          <circle cx="27" cy="22" r="2.5" />
          <circle cx="37" cy="22" r="2.5" />
          <path d="M29.5 22 h5" />
        </>
      )}
    </svg>
  );
}

export default function ExemploListaPresencaPage() {
  return (
    <div>
      <div className="mb-4 print:hidden">
        <Link
          href="/admin/listas-presenca"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Exemplo fictício.</strong> Nomes, apartamentos, fotos,
          assinaturas e horários são inventados — servem só para você ver como
          fica a lista quando os moradores registrarem presença. Na hora de
          usar, é só criar a sua lista e compartilhar o link.
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border-4 border-blue-700 print:rounded-none">
        <div className="bg-blue-700 px-6 py-5 text-center text-white">
          <h1 className="flex items-center justify-center gap-2 text-xl font-bold uppercase tracking-wide">
            <Users className="h-6 w-6 shrink-0 print:hidden" />
            Assembleia Geral Ordinária — Exemplo
          </h1>
          <p className="mt-2 whitespace-pre-line text-sm text-blue-100">
            {"Data: 25/07/2026\nInício: 19:30 (horário de Brasília)\nTipo: assembleia online"}
          </p>
        </div>
        <div className="border-b-2 border-blue-200 bg-blue-50 px-6 py-2 text-center text-sm font-medium text-blue-900">
          Lista de presença · {REGISTROS.length} presentes
        </div>

        <div className="bg-white p-4">
          <div className="divide-y divide-blue-100">
            {REGISTROS.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3 break-inside-avoid"
              >
                <span className="w-8 shrink-0 text-right text-sm font-semibold text-blue-700">
                  {i + 1}.
                </span>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-white p-1">
                  <RostoSketch variante={i} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{r.nome}</h3>
                  <p className="text-sm text-gray-500">
                    {PERFIL_LABEL[r.perfil]} · Bloco {r.bloco} · Ap.{" "}
                    {r.apartamento}
                  </p>
                  <p className="text-xs text-gray-400">
                    {dataHoraBrasilia(r.criado_em)} (horário de Brasília)
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                      {METODO_LABEL[r.metodo]}
                    </span>
                    <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      {r.aparelho}
                    </span>
                    <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      IP {r.ip}
                    </span>
                  </div>
                </div>
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-gray-200 bg-white">
                  <span
                    className="-rotate-3 text-xl leading-none text-gray-700"
                    style={{
                      fontFamily:
                        '"Segoe Script","Brush Script MT","Snell Roundhand",cursive',
                    }}
                  >
                    {r.nome.split(" ")[0]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

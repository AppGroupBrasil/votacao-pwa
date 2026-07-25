import Link from "next/link";
import { ArrowLeft, Users, Info } from "lucide-react";

const FUSO_BRASILIA = "America/Sao_Paulo";

function dataHoraBrasilia(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO_BRASILIA });
}

const CORES = [
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-green-600",
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-teal-400 to-cyan-600",
];

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

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
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
                <div
                  className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-gradient-to-br text-lg font-bold text-white ${
                    CORES[i % CORES.length]
                  }`}
                >
                  {iniciais(r.nome)}
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

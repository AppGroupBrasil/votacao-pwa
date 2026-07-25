"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Vote,
  ClipboardList,
  ListChecks,
  BarChart3,
  Shield,
  ChevronRight,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Acao = {
  href: string;
  titulo: string;
  descricao: string;
  icon: typeof Vote;
  cor: string;
  destaque?: boolean;
};

const acoes: Acao[] = [
  {
    href: "/admin/listas-presenca",
    titulo: "Criar lista de presença",
    descricao:
      "Link para os presentes registrarem presença pelo celular: selfie, nome, apartamento e assinatura. Sem cadastro prévio.",
    icon: ClipboardList,
    cor: "from-indigo-500 to-blue-600",
    destaque: true,
  },
  {
    href: "/admin/assembleias/nova-simples",
    titulo: "Criar assembleia",
    descricao:
      "Condomínio, tipo e as perguntas. Gera o link e o comprovante. O morador se cadastra na hora — sem cadastro prévio.",
    icon: Vote,
    cor: "from-primary-600 to-primary-800",
  },
];

const vantagensVotacao = [
  "Uma pergunta com respostas (ex.: “Qual a cor da fachada?”)",
  "Gera um link — você compartilha",
  "Morador vota sem nenhum cadastro: anônimo, 1 voto por aparelho",
  "Secreta (ninguém sabe quem votou) ou aberta (mostra quem votou em quê)",
  "O resultado só aparece depois que você encerra",
];

function AcaoCard({ q }: { q: Acao }) {
  return (
    <Link
      href={q.href}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${q.cor} p-6 text-white shadow-sm transition hover:shadow-lg hover:-translate-y-0.5 ${
        q.destaque ? "ring-2 ring-primary-300" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <q.icon className="w-9 h-9 opacity-90" />
        <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-90 transition" />
      </div>
      <h2 className="mt-4 text-xl font-bold">{q.titulo}</h2>
      <p className="mt-1 text-sm text-white/85">{q.descricao}</p>
    </Link>
  );
}

export default function PainelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.me().then(setUser).catch(() => router.push("/login"));
  }, [router]);

  if (!user) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Olá, {user.first_name || user.username}
        </h1>
        <p className="text-gray-500">O que você quer fazer hoje?</p>
      </div>

      {/* Ações principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {acoes.map((q) => (
          <AcaoCard key={q.href} q={q} />
        ))}
      </div>

      {/* Votação rápida — card dedicado com as vantagens */}
      <Link
        href="/admin/enquetes"
        className="group mt-4 block rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100 p-6 transition hover:shadow-lg hover:-translate-y-0.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-2.5 text-white">
              <ListChecks className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-900">
                Votação rápida
              </h2>
              <p className="text-sm text-emerald-700/80">
                Simplicidade e controle total na sua votação
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 shrink-0 text-emerald-600 opacity-0 group-hover:opacity-100 transition" />
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {vantagensVotacao.map((v) => (
            <li
              key={v}
              className="flex items-start gap-2 text-sm text-emerald-900/90"
            >
              <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600" />
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </Link>

      {/* Resultados e relatórios — menor */}
      <Link
        href="/admin/assembleias"
        className="group mt-4 flex items-center justify-between rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-100 p-5 transition hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Resultados e relatórios</h2>
            <p className="text-sm text-gray-500">
              Acompanhe a votação, veja o resultado e gere a ata.
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition" />
      </Link>

      {/* Acesso discreto — só para o dono do sistema */}
      {user.is_superuser && (
        <div className="mt-8 border-t border-gray-100 pt-5 text-sm">
          <Link
            href="/admin/master"
            className="text-gray-400 hover:text-gray-600 inline-flex items-center gap-1.5 transition-colors"
          >
            <Shield className="w-4 h-4" /> Master
          </Link>
        </div>
      )}
    </div>
  );
}

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
  Trash2,
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

const itensResultado = [
  "Placar de cada questão, atualizado ao vivo",
  "Total de votos, percentual e opção vencedora",
  "Lista de quem votou (presença e votos manuais)",
  "Ata e relatório em PDF para assinar",
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

      {/* Resultado — seção própria, separada do menu de atalhos.
          É a parte mais procurada do painel (é o que o síndico abre no dia
          da assembleia), então sai da lista de cards e ganha um bloco só
          dele, com título, separador e o card grande. */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <BarChart3 className="w-5 h-5 text-sky-700" />
          <h2 className="text-lg font-bold text-gray-900">Resultado</h2>
          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
            o que todo mundo quer ver
          </span>
        </div>

        <Link
          href="/admin/assembleias"
          className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 p-6 text-white shadow-md ring-2 ring-sky-300 transition hover:shadow-xl hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-bold">Ver o resultado da votação</h3>
              <p className="mt-1 text-sm text-white/85">
                Acompanhe ao vivo, veja quem ganhou e gere a ata.
              </p>
            </div>
            <ChevronRight className="w-6 h-6 shrink-0 opacity-70 transition group-hover:opacity-100 group-hover:translate-x-0.5" />
          </div>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {itensResultado.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-white/90">
                <Check className="mt-0.5 w-4 h-4 shrink-0 text-sky-200" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Link>
      </section>

      {/* Acessos discretos — só para o dono do sistema */}
      {user.is_superuser && (
        <div className="mt-8 flex items-center gap-5 border-t border-gray-100 pt-5 text-sm">
          <Link
            href="/admin/master"
            className="text-gray-400 hover:text-gray-600 inline-flex items-center gap-1.5 transition-colors"
          >
            <Shield className="w-4 h-4" /> Master
          </Link>
          <Link
            href="/admin/exclusoes"
            className="text-gray-400 hover:text-gray-600 inline-flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Pedidos de exclusão (LGPD)
          </Link>
        </div>
      )}
    </div>
  );
}

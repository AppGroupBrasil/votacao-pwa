"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Vote,
  Building2,
  UserCheck,
  BarChart3,
  Shield,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Quadrado = {
  href: string;
  titulo: string;
  descricao: string;
  icon: typeof Vote;
  cor: string;
  destaque?: boolean;
};

const modos: Quadrado[] = [
  {
    href: "/admin/assembleias/nova-simples",
    titulo: "Votação Simples",
    descricao:
      "Crie a assembleia na hora: nome do condomínio, tipo e as questões. Gera o link e o comprovante.",
    icon: Vote,
    cor: "from-primary-600 to-primary-800",
    destaque: true,
  },
  {
    href: "/admin/cadastro",
    titulo: "Votação Completa",
    descricao:
      "Cadastro completo de condomínio e moradores, no formato tradicional.",
    icon: Building2,
    cor: "from-slate-600 to-slate-800",
  },
];

const ferramentas: Quadrado[] = [
  {
    href: "/admin/presenca",
    titulo: "Lista de presença",
    descricao: "Quem entrou na assembleia, em tempo real.",
    icon: UserCheck,
    cor: "from-indigo-500 to-blue-600",
  },
  {
    href: "/admin/assembleias",
    titulo: "Resultados e relatórios",
    descricao: "Acompanhe a votação, veja o resultado e gere o relatório.",
    icon: BarChart3,
    cor: "from-purple-500 to-fuchsia-600",
  },
];

function Card({ q }: { q: Quadrado }) {
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

      {/* Dois caminhos no topo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modos.map((q) => (
          <Card key={q.href} q={q} />
        ))}
      </div>

      {/* Ferramentas compartilhadas */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ferramentas.map((q) => (
          <Card key={q.href} q={q} />
        ))}
      </div>

      {/* Acessos discretos — vivos, fora do painel principal */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm border-t border-gray-100 pt-5">
        <Link
          href="/admin/enquetes"
          className="text-gray-400 hover:text-gray-600 inline-flex items-center gap-1.5 transition-colors"
        >
          <ListChecks className="w-4 h-4" /> Enquete rápida
        </Link>
        {user.is_superuser && (
          <Link
            href="/admin/master"
            className="text-gray-400 hover:text-gray-600 inline-flex items-center gap-1.5 transition-colors"
          >
            <Shield className="w-4 h-4" /> Master
          </Link>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderPlus,
  Vote,
  ListChecks,
  UserCheck,
  BarChart3,
  FileText,
  Shield,
  ChevronRight,
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

const quadrados: Quadrado[] = [
  {
    href: "/admin/cadastro",
    titulo: "Cadastro",
    descricao: "Condomínio, moradores e assembleias. Comece por aqui.",
    icon: FolderPlus,
    cor: "from-amber-500 to-orange-600",
  },
  {
    href: "/admin/assembleias",
    titulo: "Votação Online",
    descricao: "Assembleias com voto identificado e seguro.",
    icon: Vote,
    cor: "from-primary-600 to-primary-800",
    destaque: true,
  },
  {
    href: "/admin/enquetes",
    titulo: "Votação Simples",
    descricao: "Enquete anônima por link. Rápida e sem cadastro.",
    icon: ListChecks,
    cor: "from-teal-500 to-emerald-600",
  },
  {
    href: "/admin/presenca",
    titulo: "Lista de Presença",
    descricao: "Quem entrou na assembleia, em tempo real.",
    icon: UserCheck,
    cor: "from-indigo-500 to-blue-600",
  },
  {
    href: "/admin/resultados",
    titulo: "Relatórios e Resultados",
    descricao: "Resultados consolidados e lista de votantes.",
    icon: BarChart3,
    cor: "from-purple-500 to-fuchsia-600",
  },
  {
    href: "/admin/ata",
    titulo: "Resumo e Ata",
    descricao: "Transcrição, resumo e geração da ata da assembleia.",
    icon: FileText,
    cor: "from-slate-600 to-slate-800",
  },
];

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {quadrados.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${q.cor} p-6 text-white shadow-sm transition hover:shadow-lg hover:-translate-y-0.5 ${
              q.destaque ? "sm:col-span-2 lg:col-span-1 ring-2 ring-primary-300" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <q.icon className="w-9 h-9 opacity-90" />
              <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-90 transition" />
            </div>
            <h2 className="mt-4 text-xl font-bold">{q.titulo}</h2>
            <p className="mt-1 text-sm text-white/85">{q.descricao}</p>
          </Link>
        ))}

        {user.is_superuser && (
          <Link
            href="/admin/master"
            className="group relative overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6 text-gray-700 transition hover:border-gray-400 hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <Shield className="w-9 h-9 text-gray-500" />
              <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-90 transition" />
            </div>
            <h2 className="mt-4 text-xl font-bold">Master</h2>
            <p className="mt-1 text-sm text-gray-500">
              Administração geral do sistema e condomínios.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}

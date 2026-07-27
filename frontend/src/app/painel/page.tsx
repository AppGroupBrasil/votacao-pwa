"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Vote,
  ClipboardList,
  BarChart3,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function PainelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [condominio, setCondominio] = useState("");

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setUser(u);
        return api.getCondominios();
      })
      .then((d) => {
        const nomes = (d.results || []).map((c) => c.nome).filter(Boolean);
        if (nomes.length === 1) setCondominio(nomes[0]);
        else if (nomes.length > 1) setCondominio(`${nomes.length} condomínios`);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function sair() {
    try {
      await api.logout();
    } catch {
      /* ignora */
    }
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-6">
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Vote className="h-6 w-6" />
              <span className="font-bold">Votação Online</span>
            </div>
            <button
              onClick={sair}
              className="inline-flex items-center gap-1.5 text-sm text-primary-200 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
          <p className="mb-1 text-sm font-medium uppercase tracking-wide text-primary-200">
            Painel do condomínio
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">
            Olá, {user.first_name || user.username}
          </h1>
          {condominio && (
            <p className="mt-1 text-primary-200">{condominio}</p>
          )}
        </div>
      </header>

      <main className="-mt-14 flex-1 px-4 pb-16">
        <div className="mx-auto max-w-md space-y-4">
          <Link
            href="/admin/listas-presenca"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <ClipboardList className="h-10 w-10 shrink-0 opacity-90" />
            <div className="flex-1">
              <h2 className="text-xl font-bold">Lista de presença</h2>
              <p className="text-sm text-white/85">
                Acompanhe quem registrou presença no seu condomínio.
              </p>
            </div>
            <ChevronRight className="h-6 w-6 shrink-0 opacity-70 transition group-hover:translate-x-0.5" />
          </Link>

          <Link
            href="/admin/assembleias"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <BarChart3 className="h-10 w-10 shrink-0 opacity-90" />
            <div className="flex-1">
              <h2 className="text-xl font-bold">Votações</h2>
              <p className="text-sm text-white/85">
                Acompanhe a votação, os resultados e os relatórios.
              </p>
            </div>
            <ChevronRight className="h-6 w-6 shrink-0 opacity-70 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </main>

      <footer className="bg-gray-900 py-6 text-center text-xs text-gray-400">
        © 2026 Votação Online
      </footer>
    </div>
  );
}

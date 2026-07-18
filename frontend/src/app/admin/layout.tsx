"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Vote, LogOut, UserCircle, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  const noPainel = pathname === "/admin";

  const roleLabel =
    user?.role === "master"
      ? "Master"
      : user?.role === "administradora"
        ? "Administradora"
        : user?.role === "sindico"
          ? "Síndico"
          : "";

  useEffect(() => {
    api.me().then(setUser).catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    try { await api.logout(); } catch {}
    router.push("/login");
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!noPainel && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-700 transition-colors"
                title="Voltar ao painel"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Painel</span>
              </Link>
            )}
            <Link
              href="/admin"
              className="flex items-center gap-2 font-bold text-primary-700"
            >
              <Vote className="w-6 h-6" />
              <span className="hidden sm:inline">Votação Online</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/conta"
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-700 transition-colors"
              title="Minha Conta"
            >
              <UserCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{user.first_name || user.username}</span>
              {roleLabel && (
                <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
                  {roleLabel}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

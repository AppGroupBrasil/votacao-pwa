"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Vote,
  Users,
  BarChart3,
  Building2,
  LogOut,
  Menu,
  X,
  Shield,
  UserCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { clsx } from "clsx";

const navItems = [
  { href: "/admin/assembleias", label: "Assembleias", icon: Vote },
  { href: "/admin/eleitores", label: "Eleitores", icon: Users },
  { href: "/admin/resultados", label: "Resultados", icon: BarChart3 },
  { href: "/admin/condominios", label: "Condomínios", icon: Building2 },
];

const masterNavItem = { href: "/admin/master", label: "Master", icon: Shield };

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const allNavItems = user?.is_superuser
    ? [...navItems, masterNavItem]
    : navItems;

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
      {/* Top Nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-gray-600"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              href="/admin/assembleias"
              className="flex items-center gap-2 font-bold text-primary-700"
            >
              <Vote className="w-6 h-6" />
              <span className="hidden sm:inline">Votação Online</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {allNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/conta"
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-700 transition-colors hidden sm:flex"
              title="Minha Conta"
            >
              <UserCircle className="w-4 h-4" />
              {user.first_name || user.username}
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

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="md:hidden border-t border-gray-100 px-4 py-2 space-y-1">
            {allNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
                  pathname.startsWith(item.href)
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-600"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
            <Link
              href="/admin/conta"
              onClick={() => setMenuOpen(false)}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
                pathname === "/admin/conta"
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600"
              )}
            >
              <UserCircle className="w-4 h-4" />
              Minha Conta
            </Link>
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

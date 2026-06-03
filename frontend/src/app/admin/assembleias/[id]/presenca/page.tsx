"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Printer, FileDown } from "lucide-react";
import { api } from "@/lib/api";
import type { Assembleia } from "@/lib/types";

const perfilLabel: Record<string, string> = {
  proprietario: "Proprietário",
  procurador: "Procurador",
};

const metodoLabel: Record<string, string> = {
  acesso: "Acesso ao sistema",
  facial: "Reconhecimento facial",
  webauthn: "Biometria do dispositivo",
  otp: "Código (OTP)",
};

export default function ListaPresencaPage() {
  const params = useParams();
  const assembleiaId = params.id as string;
  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getAssembleia(assembleiaId)
      .then(setAssembleia)
      .finally(() => setLoading(false));
  }, [assembleiaId]);

  function exportarCsv() {
    if (!assembleia) return;
    const linhas = [
      ["Nome", "Bloco", "Apartamento", "Perfil", "Método", "Horário de entrada"],
      ...presencas.map((p) => [
        p.nome,
        p.bloco || "",
        p.apartamento || "",
        perfilLabel[p.perfil] || p.perfil,
        metodoLabel[p.metodo_auth] || p.metodo_auth,
        new Date(p.horario_entrada).toLocaleString("pt-BR"),
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presenca-${assembleia.titulo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-gray-500">Carregando...</p>;
  if (!assembleia)
    return <p className="text-gray-500">Assembleia não encontrada.</p>;

  const presencas = [...(assembleia.presencas || [])].sort(
    (a, b) =>
      new Date(a.horario_entrada).getTime() -
      new Date(b.horario_entrada).getTime()
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/admin/assembleias/${assembleiaId}`}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarCsv}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn-primary flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-bold">Lista de Presença</h1>
        <p className="text-gray-500">{assembleia.titulo}</p>
        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
          <Users className="w-4 h-4" />
          {presencas.length} presente{presencas.length !== 1 ? "s" : ""}
        </p>
      </div>

      {presencas.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            Nenhum morador acessou o sistema ainda.
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-3 font-medium w-10">#</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Entrada</th>
              </tr>
            </thead>
            <tbody>
              {presencas.map((p, i) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{p.nome}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.bloco ? `${p.bloco} / ` : ""}
                    {p.apartamento}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {perfilLabel[p.perfil] || p.perfil}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {metodoLabel[p.metodo_auth] || p.metodo_auth}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(p.horario_entrada).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Printer,
  FileDown,
  UserPlus,
  X,
  Search,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Assembleia, Eleitor, Presenca } from "@/lib/types";

const perfilLabel: Record<string, string> = {
  proprietario: "Proprietário",
  procurador: "Procurador",
};

const metodoLabel: Record<string, string> = {
  acesso: "Acesso ao sistema",
  facial: "Reconhecimento facial",
  selfie: "Selfie",
  webauthn: "Biometria do dispositivo",
  otp: "Código (OTP)",
  manual: "Marcado pelo síndico",
};

export default function ListaPresencaPage() {
  const params = useParams();
  const assembleiaId = params.id as string;
  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // Fotos (selfie/assinatura) vêm à parte da listagem, sob demanda. capturaMap
  // guarda o que já foi baixado; pedidosRef marca ids já consultados (com ou sem
  // foto) para o polling de 15s não rebaixar tudo a cada volta.
  const [capturaMap, setCapturaMap] = useState<
    Record<string, { selfie: string; assinatura: string }>
  >({});
  const pedidosRef = useRef<Set<string>>(new Set());

  async function carregar() {
    const a = await api.getAssembleia(assembleiaId);
    setAssembleia(a);
    const eraVazio = pedidosRef.current.size === 0;
    const novos = (a.presencas || [])
      .map((p) => p.id)
      .filter((id) => !pedidosRef.current.has(id));
    if (novos.length) {
      try {
        const { capturas } = await api.getPresencasCaptura(
          assembleiaId,
          eraVazio ? undefined : novos
        );
        // marca só após sucesso: se o fetch falhar, os ids ficam por baixar e
        // são tentados de novo na próxima volta do polling.
        novos.forEach((id) => pedidosRef.current.add(id));
        if (capturas.length) {
          setCapturaMap((prev) => {
            const next = { ...prev };
            for (const c of capturas) {
              next[c.id] = { selfie: c.selfie, assinatura: c.assinatura };
            }
            return next;
          });
        }
      } catch {
        /* sem fotos nesta volta; ids seguem por baixar, reingressam na próxima */
      }
    }
  }

  useEffect(() => {
    carregar().finally(() => setLoading(false));
    const t = setInterval(() => {
      carregar().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembleiaId]);

  function exportarCsv() {
    if (!assembleia) return;
    const linhas = [
      ["Nome", "Bloco", "Apartamento", "Inadimplente", "Perfil", "Método", "Registro facial", "IP", "Aparelho", "Horário de entrada"],
      ...presencas.map((p) => [
        p.nome,
        p.bloco || "",
        p.apartamento || "",
        p.inadimplente ? "Sim" : "Não",
        perfilLabel[p.perfil] || p.perfil,
        metodoLabel[p.metodo_auth] || p.metodo_auth,
        p.assinatura_facial || "",
        p.ip_address || "",
        p.device_info || "",
        new Date(p.horario_entrada).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
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

  async function toggleInadimplente(p: Presenca) {
    const novo = !p.inadimplente;
    setAssembleia((prev) =>
      prev
        ? {
            ...prev,
            presencas: (prev.presencas || []).map((x) =>
              x.id === p.id ? { ...x, inadimplente: novo } : x
            ),
          }
        : prev
    );
    try {
      await api.marcarPresencaInadimplente(assembleiaId, p.id, novo);
    } catch {
      setAssembleia((prev) =>
        prev
          ? {
              ...prev,
              presencas: (prev.presencas || []).map((x) =>
                x.id === p.id ? { ...x, inadimplente: !novo } : x
              ),
            }
          : prev
      );
    }
  }

  if (loading) return <p className="text-gray-500">Carregando...</p>;
  if (!assembleia)
    return <p className="text-gray-500">Assembleia não encontrada.</p>;

  const presencas = [...(assembleia.presencas || [])].sort((a, b) => {
    const porBloco = (a.bloco || "").localeCompare(b.bloco || "", "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
    if (porBloco !== 0) return porBloco;
    return (a.apartamento || "").localeCompare(b.apartamento || "", "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
  const encerrada = assembleia.status === "encerrada";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
        <Link
          href={`/admin/assembleias/${assembleiaId}`}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {!encerrada && (
            <button
              onClick={() => setModalOpen(true)}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Marcar presença
            </button>
          )}
          <button
            onClick={exportarCsv}
            className="btn-secondary flex items-center gap-2"
          >
            <FileDown className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn-secondary flex items-center gap-2"
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

      {assembleia.quorum && (
        <QuorumCard q={assembleia.quorum} />
      )}

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
                <th className="px-4 py-3 font-medium text-center">Inadimpl.</th>
                <th className="px-4 py-3 font-medium">Perfil</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Registro facial</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Aparelho</th>
                <th className="px-4 py-3 font-medium">Captura</th>
                <th className="px-4 py-3 font-medium">Entrada</th>
              </tr>
            </thead>
            <tbody>
              {presencas.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b last:border-0 ${
                    p.inadimplente ? "bg-red-50" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    {p.nome}
                    {!p.eleitor && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        avulso
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.bloco ? `${p.bloco} / ` : ""}
                    {p.apartamento}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={p.inadimplente}
                      onChange={() => toggleInadimplente(p)}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-red-600 focus:ring-red-500"
                      title="Marcar como inadimplente"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {perfilLabel[p.perfil] || p.perfil}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {metodoLabel[p.metodo_auth] || p.metodo_auth}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs" title={p.assinatura_facial || ""}>
                    {p.assinatura_facial
                      ? p.assinatura_facial.slice(0, 12) + "…"
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {p.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {p.device_info || "—"}
                    {p.marca_aparelho ? (
                      <div className="text-gray-400">{p.marca_aparelho}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {capturaMap[p.id]?.selfie ? (
                        <a href={capturaMap[p.id].selfie} target="_blank" rel="noopener noreferrer" title="Ver selfie">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={capturaMap[p.id].selfie} alt="selfie" className="h-9 w-9 rounded object-cover border" />
                        </a>
                      ) : null}
                      {capturaMap[p.id]?.assinatura ? (
                        <a href={capturaMap[p.id].assinatura} target="_blank" rel="noopener noreferrer" title="Ver assinatura">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={capturaMap[p.id].assinatura} alt="assinatura" className="h-9 w-16 rounded object-contain border bg-white" />
                        </a>
                      ) : null}
                      {p.geo_lat != null && p.geo_lng != null ? (
                        <a
                          href={`https://www.google.com/maps?q=${p.geo_lat},${p.geo_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 underline"
                          title="Localização registrada"
                        >
                          GPS
                        </a>
                      ) : null}
                      {!capturaMap[p.id]?.selfie && !capturaMap[p.id]?.assinatura && p.geo_lat == null ? (
                        <span className="text-gray-300">—</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(p.horario_entrada).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <MarcarPresencaModal
          assembleia={assembleia}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            carregar();
          }}
        />
      )}
    </div>
  );
}

function QuorumCard({ q }: { q: import("@/lib/types").Quorum }) {
  const pct = Math.min(q.percentual, 100);
  const corBarra = q.atingido_primeira
    ? "bg-green-500"
    : q.atingido_segunda
    ? "bg-amber-500"
    : "bg-gray-400";
  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-600">Quórum</h2>
        <span className="text-sm text-gray-500">
          {q.presentes} de {q.base_eleitores} ({q.percentual}%)
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full ${corBarra} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div
          className={`rounded-lg border px-3 py-2 ${
            q.atingido_primeira
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-gray-200 text-gray-600"
          }`}
        >
          <p className="font-medium">
            1ª chamada · {q.regra_primeira}
          </p>
          <p className="text-xs">
            {q.atingido_primeira
              ? "Quórum atingido"
              : `Faltam ${Math.max(q.necessario_primeira - q.presentes, 0)} (mín. ${q.necessario_primeira})`}
          </p>
        </div>
        <div
          className={`rounded-lg border px-3 py-2 ${
            q.atingido_segunda
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-gray-200 text-gray-600"
          }`}
        >
          <p className="font-medium">2ª chamada · {q.regra_segunda}</p>
          <p className="text-xs">
            {q.atingido_segunda
              ? "Quórum atingido"
              : `Faltam ${Math.max(q.necessario_segunda - q.presentes, 0)} (mín. ${q.necessario_segunda})`}
          </p>
        </div>
      </div>
    </div>
  );
}

function MarcarPresencaModal({
  assembleia,
  onClose,
  onSaved,
}: {
  assembleia: Assembleia;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [aba, setAba] = useState<"cadastrado" | "avulso">("cadastrado");
  const [eleitores, setEleitores] = useState<Eleitor[]>([]);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  // avulso
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");

  useEffect(() => {
    api
      .getEleitores()
      .then((d) => {
        const lista = d.results || (d as any);
        setEleitores(
          lista.filter((e: Eleitor) => e.condominio === assembleia.condominio)
        );
      })
      .catch(() => {});
  }, [assembleia.condominio]);

  const presentesIds = new Set(
    (assembleia.presencas || []).map((p) => p.eleitor).filter(Boolean)
  );

  const filtrados = eleitores.filter((e) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      e.nome.toLowerCase().includes(q) ||
      (e.apartamento || "").toLowerCase().includes(q) ||
      (e.bloco || "").toLowerCase().includes(q)
    );
  });

  async function marcarCadastrado(e: Eleitor) {
    setErro("");
    setOk("");
    setSalvando(true);
    try {
      await api.marcarPresenca(assembleia.id, { eleitor_id: e.id });
      setOk(`${e.nome} marcado(a) como presente.`);
      onSaved();
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao marcar presença.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcarAvulso() {
    setErro("");
    setOk("");
    if (!nome.trim() || !apartamento.trim()) {
      setErro("Informe nome e apartamento.");
      return;
    }
    setSalvando(true);
    try {
      await api.marcarPresenca(assembleia.id, {
        nome: nome.trim(),
        apartamento: apartamento.trim(),
        bloco: bloco.trim(),
      });
      setOk(`${nome.trim()} marcado(a) como presente.`);
      setNome("");
      setBloco("");
      setApartamento("");
      onSaved();
    } catch (err: any) {
      setErro(err?.response?.data?.error || "Erro ao marcar presença.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Marcar presença</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 mb-4">
          <button
            onClick={() => setAba("cadastrado")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              aba === "cadastrado" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            Morador cadastrado
          </button>
          <button
            onClick={() => setAba("avulso")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              aba === "avulso" ? "bg-white shadow-sm" : "text-gray-500"
            }`}
          >
            Sem cadastro
          </button>
        </div>

        {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
        {ok && (
          <p className="mb-3 text-sm text-green-600 flex items-center gap-1">
            <Check className="w-4 h-4" /> {ok}
          </p>
        )}

        {aba === "cadastrado" ? (
          <div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, bloco ou apartamento"
                className="input-field w-full pl-9"
              />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y border rounded-lg">
              {filtrados.length === 0 && (
                <p className="p-4 text-sm text-gray-500 text-center">
                  Nenhum morador encontrado.
                </p>
              )}
              {filtrados.map((e) => {
                const presente = presentesIds.has(e.id);
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.nome}</p>
                      <p className="text-xs text-gray-500">
                        {e.bloco ? `${e.bloco} / ` : ""}
                        {e.apartamento} · {perfilLabel[e.perfil] || e.perfil}
                      </p>
                    </div>
                    {presente ? (
                      <span className="text-xs text-green-600 flex items-center gap-1 shrink-0">
                        <Check className="w-4 h-4" /> Presente
                      </span>
                    ) : (
                      <button
                        onClick={() => marcarCadastrado(e)}
                        disabled={salvando}
                        className="btn-primary text-sm py-1.5 px-3 shrink-0 disabled:opacity-50"
                      >
                        Marcar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do morador"
                className="input-field w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Bloco</label>
                <input
                  value={bloco}
                  onChange={(e) => setBloco(e.target.value)}
                  placeholder="Opcional"
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Apartamento
                </label>
                <input
                  value={apartamento}
                  onChange={(e) => setApartamento(e.target.value)}
                  placeholder="Ex.: 101"
                  className="input-field w-full"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Morador sem cadastro entra como <strong>avulso</strong>: conta na
              presença, mas não vota pelo aplicativo.
            </p>
            <button
              onClick={marcarAvulso}
              disabled={salvando}
              className="btn-primary w-full disabled:opacity-50"
            >
              {salvando ? "Marcando..." : "Marcar presença"}
            </button>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-secondary">
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}

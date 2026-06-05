"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Plus, Send, UserCheck, UserX, Link2, Check, Upload, Download, Pencil, Trash2, Lock, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import type { Eleitor, Condominio } from "@/lib/types";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function EleitoresPage() {
  const [eleitores, setEleitores] = useState<Eleitor[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [filtroCondominio, setFiltroCondominio] = useState("");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [copiedAuto, setCopiedAuto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const condAtivo =
    condominios.find(
      (c) => c.id === (filtroCondominio || (condominios.length === 1 ? condominios[0]?.id : ""))
    ) || null;

  async function toggleAutocadastro() {
    if (!condAtivo) return;
    try {
      const updated = await api.updateCondominio(condAtivo.id, {
        autocadastro_ativo: !condAtivo.autocadastro_ativo,
      });
      setCondominios((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch {
      alert("Erro ao alterar o autocadastro.");
    }
  }

  async function copiarLinkAutocadastro() {
    if (!condAtivo) return;
    try {
      let token = condAtivo.autocadastro_token;
      if (!token) {
        const res = await api.gerarLinkAutocadastro(condAtivo.id);
        token = res.autocadastro_token;
        setCondominios((prev) =>
          prev.map((x) => (x.id === condAtivo.id ? { ...x, autocadastro_token: token } : x))
        );
      }
      await navigator.clipboard.writeText(`${window.location.origin}/autocadastro/${token}`);
      setCopiedAuto(true);
      setTimeout(() => setCopiedAuto(false), 2000);
    } catch {
      alert("Erro ao gerar o link de autocadastro.");
    }
  }

  async function reload() {
    const d = await api.getEleitores();
    setEleitores((d as any).results || d);
  }

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["nome", "cpf", "bloco", "apartamento", "email"],
      ["João da Silva", "12345678900", "A", "101", "joao@email.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Moradores");
    XLSX.writeFile(wb, "modelo-moradores.xlsx");
  }

  function escolherArquivo() {
    const condId = filtroCondominio || (condominios.length === 1 ? condominios[0].id : "");
    if (!condId) {
      alert("Selecione o condomínio no filtro acima antes de importar.");
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const condId = filtroCondominio || (condominios.length === 1 ? condominios[0].id : "");
    if (!condId) return;

    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      const norm = (r: Record<string, any>, ...keys: string[]) => {
        for (const k of Object.keys(r)) {
          if (keys.includes(k.trim().toLowerCase())) return String(r[k]).trim();
        }
        return "";
      };

      const eleitoresPayload = [];
      for (const r of rows) {
        const cpf = norm(r, "cpf");
        eleitoresPayload.push({
          nome: norm(r, "nome"),
          cpf_hash: cpf ? await sha256Hex(cpf) : "",
          bloco: norm(r, "bloco"),
          apartamento: norm(r, "apartamento", "apto", "ap"),
          email: norm(r, "email", "e-mail"),
        });
      }

      if (eleitoresPayload.length === 0) {
        alert("Planilha vazia ou sem dados válidos.");
        return;
      }

      const res = await api.bulkCreateEleitores(condId, eleitoresPayload);
      await reload();
      const linhasErro = res.erros.map((x) => `linha ${x.linha}`).join(", ");
      alert(
        `${res.criados} morador(es) importado(s).` +
          (res.erros.length ? `\n${res.erros.length} com erro: ${linhasErro}` : "")
      );
    } catch {
      alert("Erro ao processar a planilha. Verifique o formato (use o modelo).");
    } finally {
      setImportando(false);
    }
  }

  async function handleInadimplencia(e: Eleitor, valor: boolean) {
    try {
      await api.setInadimplenciaEleitor(e.id, valor);
      setEleitores((prev) =>
        prev.map((x) =>
          x.condominio === e.condominio &&
          x.bloco === e.bloco &&
          x.apartamento === e.apartamento
            ? { ...x, inadimplente: valor }
            : x
        )
      );
    } catch {
      alert("Erro ao alterar a inadimplência.");
    }
  }

  async function handleBloqueio(e: Eleitor) {
    try {
      const r = await api.setBloqueioEleitor(e.id, !e.bloqueado);
      setEleitores((prev) =>
        prev.map((x) => (x.id === e.id ? { ...x, bloqueado: r.bloqueado } : x))
      );
    } catch {
      alert("Erro ao alterar o bloqueio.");
    }
  }

  async function handleDelete(e: Eleitor) {
    if (!confirm(`Excluir o morador "${e.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.deleteEleitor(e.id);
      setEleitores((prev) => prev.filter((x) => x.id !== e.id));
    } catch {
      alert("Erro ao excluir o morador.");
    }
  }

  async function handleCopyLink(eleitorId: string) {
    try {
      const res = await api.enviarConvite(eleitorId);
      const link = `${window.location.origin}/cadastro/${res.token}`;
      await navigator.clipboard.writeText(link);
      setCopiedId(eleitorId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert("Erro ao gerar link de convite.");
    }
  }

  useEffect(() => {
    Promise.all([
      api.getEleitores().then((d) => setEleitores(d.results || d)),
      api.getCondominios().then((d) => setCondominios(d.results || d)),
    ]).finally(() => setLoading(false));
  }, []);

  const termo = busca.trim().toLowerCase();
  const filtered = eleitores
    .filter((e) => (filtroCondominio ? e.condominio === filtroCondominio : true))
    .filter((e) =>
      termo
        ? [e.nome, e.bloco, e.apartamento, e.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termo))
        : true
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Moradores</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={baixarModelo}
            className="btn-secondary flex items-center gap-2"
            title="Baixar planilha modelo (.xlsx)"
          >
            <Download className="w-4 h-4" />
            Modelo
          </button>
          <button
            onClick={escolherArquivo}
            disabled={importando}
            className="btn-secondary flex items-center gap-2"
            title="Importar moradores de uma planilha Excel"
          >
            <Upload className="w-4 h-4" />
            {importando ? "Importando..." : "Importar Excel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleArquivo}
            className="hidden"
          />
          <Link
            href="/admin/eleitores/novo"
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Morador
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, bloco, apto ou email..."
          className="input-field w-full sm:w-96"
        />
      </div>

      {condominios.length > 1 && (
        <div className="mb-4">
          <select
            value={filtroCondominio}
            onChange={(e) => setFiltroCondominio(e.target.value)}
            className="input-field w-64"
          >
            <option value="">Todos os condomínios</option>
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="card mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium text-gray-800">Autocadastro por link</p>
          <p className="text-sm text-gray-500">
            {condAtivo
              ? `Moradores do "${condAtivo.nome}" podem se cadastrar pelo link público quando liberado.`
              : "Selecione um condomínio no filtro acima para liberar o link de autocadastro."}
          </p>
        </div>
        {condAtivo && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm font-medium text-gray-700">Liberado</span>
              <button
                type="button"
                role="switch"
                aria-checked={condAtivo.autocadastro_ativo}
                onClick={toggleAutocadastro}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  condAtivo.autocadastro_ativo ? "bg-primary-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    condAtivo.autocadastro_ativo ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>
            <button
              type="button"
              onClick={copiarLinkAutocadastro}
              disabled={!condAtivo.autocadastro_ativo}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
              title={
                condAtivo.autocadastro_ativo
                  ? "Copiar link público de autocadastro"
                  : "Libere o autocadastro para gerar o link"
              }
            >
              {copiedAuto ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Link copiado!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Copiar link
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Nenhum morador cadastrado.</p>
        </div>
      ) : (
        <div className="card overflow-hidden !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-center px-3 py-3 font-medium" title="Inadimplente (por unidade)">
                  Inad.
                </th>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Apto</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                  Email
                </th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b last:border-0 hover:bg-gray-50 ${
                    e.inadimplente ? "bg-red-50/60" : ""
                  } ${e.bloqueado ? "opacity-60" : ""}`}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={e.inadimplente}
                      onChange={(ev) => handleInadimplencia(e, ev.target.checked)}
                      className="w-4 h-4 accent-red-600 cursor-pointer"
                      title="Marcar a unidade como inadimplente (impede o voto de todos os moradores da unidade)"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {e.nome}
                    {e.bloqueado && (
                      <span className="ml-2 inline-flex items-center gap-1 text-red-700 text-xs font-medium bg-red-100 px-2 py-0.5 rounded-full align-middle">
                        <Lock className="w-3 h-3" /> Bloqueado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.bloco ? `${e.bloco} / ` : ""}
                    {e.apartamento}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                    {e.email}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.cadastro_completo ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">
                        <UserCheck className="w-3 h-3" /> Completo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                        <UserX className="w-3 h-3" /> Pendente
                        <span
                          title="O morador ainda não completou o cadastro. Envie o convite para que ele cadastre sua biometria facial ou WebAuthn."
                          className="cursor-help inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 font-bold text-xs hover:bg-amber-300 transition-colors ml-1"
                        >
                          ?
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {!e.cadastro_completo && (
                        <button
                          onClick={() => handleCopyLink(e.id)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                          title="Copiar link de cadastro"
                        >
                          {copiedId === e.id ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <Link
                        href={`/admin/eleitores/${e.id}/editar`}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Editar morador"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleBloqueio(e)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                          e.bloqueado
                            ? "text-green-600 hover:bg-green-50"
                            : "text-amber-600 hover:bg-amber-50"
                        }`}
                        title={e.bloqueado ? "Desbloquear morador" : "Bloquear morador"}
                      >
                        {e.bloqueado ? (
                          <Unlock className="w-4 h-4" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(e)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                        title="Excluir morador"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

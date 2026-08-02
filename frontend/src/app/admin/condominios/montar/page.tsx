"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Building2,
  Users,
  CheckCircle2,
  FileSpreadsheet,
  UserPlus,
  Link2,
  Check,
  Download,
  Upload,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ClipboardCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Condominio } from "@/lib/types";
import BlocosEditor from "@/components/BlocosEditor";

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Espelha o normalizar_unidade do backend: tira prefixo (apto/bloco/torre…) e
// deixa só letras/números minúsculos, para casar "101" com "Apto 101".
function normUnidade(valor: string): string {
  let s = (valor || "").toString().trim().toLowerCase();
  s = s.replace(
    /^(apartamento|apto|apt|ap|bloco|bl|torre|tr|casa|lote|unidade|unid|un)\b[\s.:\-nº°]*/,
    ""
  );
  return s.replace(/[^a-z0-9]/g, "");
}

function colar(r: Record<string, any>, ...keys: string[]) {
  for (const k of Object.keys(r)) {
    if (keys.includes(k.trim().toLowerCase())) return String(r[k]).trim();
  }
  return "";
}

const PASSOS = ["Condomínio", "Moradores", "Pronto"];

export default function MontarCondominioPage() {
  const router = useRouter();
  const [passo, setPasso] = useState(0);

  // Passo 1
  const [cond, setCond] = useState({
    nome: "",
    cnpj: "",
    total_unidades: 0,
    blocos: [] as string[],
  });
  const [criando, setCriando] = useState(false);
  const [criado, setCriado] = useState<Condominio | null>(null);
  const [erro, setErro] = useState("");

  // Passo 2 — contadores
  const [moradores, setMoradores] = useState(0);
  const [inadimplentes, setInadimplentes] = useState(0);
  const [importandoM, setImportandoM] = useState(false);
  const [importandoI, setImportandoI] = useState(false);
  const fileM = useRef<HTMLInputElement>(null);
  const fileI = useRef<HTMLInputElement>(null);

  // Passo 2 — cadastro manual inline
  const [man, setMan] = useState({ nome: "", bloco: "", apartamento: "", email: "", votos_permitidos: 1 });
  const [salvandoMan, setSalvandoMan] = useState(false);
  const [avisoMan, setAvisoMan] = useState("");

  // Passo 2 — autocadastro
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [autoToken, setAutoToken] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function criarCondominio(e: React.FormEvent) {
    e.preventDefault();
    if (!cond.nome.trim()) {
      setErro("Informe o nome do condomínio.");
      return;
    }
    setCriando(true);
    setErro("");
    try {
      const c = await api.createCondominio(cond);
      setCriado(c);
      setAutoAtivo(c.autocadastro_ativo);
      setAutoToken(c.autocadastro_token);
      setPasso(1);
    } catch (err: any) {
      const data = err?.response?.data;
      if (err?.response?.status === 401) {
        setErro("Sessão expirada. Faça login novamente.");
      } else if (data && typeof data === "object") {
        setErro(
          Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
            .join(" | ") || "Erro ao criar condomínio."
        );
      } else {
        setErro("Erro ao criar condomínio.");
      }
    } finally {
      setCriando(false);
    }
  }

  async function importarMoradores(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !criado) return;
    setImportandoM(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(
        wb.Sheets[wb.SheetNames[0]],
        { defval: "" }
      );
      const payload = [];
      for (const r of rows) {
        const cpf = colar(r, "cpf");
        const nome = colar(r, "nome");
        if (!nome) continue;
        payload.push({
          nome,
          cpf_hash: cpf ? await sha256Hex(cpf) : "",
          bloco: colar(r, "bloco"),
          apartamento: colar(r, "apartamento", "apto", "ap"),
          email: colar(r, "email", "e-mail"),
        });
      }
      if (payload.length === 0) {
        alert("Planilha vazia ou sem a coluna nome.");
        return;
      }
      const res = await api.bulkCreateEleitores(criado.id, payload);
      setMoradores((m) => m + res.criados);
      alert(
        `${res.criados} morador(es) importado(s).` +
          (res.pulados ? `\n${res.pulados} já existiam e foram ignorados.` : "") +
          (res.erros.length ? `\n${res.erros.length} linha(s) com erro.` : "")
      );
    } catch {
      alert("Erro ao processar a planilha. Use o modelo (colunas: nome, cpf, bloco, apartamento, email).");
    } finally {
      setImportandoM(false);
    }
  }

  async function importarInadimplentes(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !criado) return;
    setImportandoI(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(
        wb.Sheets[wb.SheetNames[0]],
        { defval: "" }
      );
      const alvos = rows
        .map((r) => ({
          nb: normUnidade(colar(r, "bloco")),
          na: normUnidade(colar(r, "apartamento", "apto", "ap")),
        }))
        .filter((x) => x.na);
      if (alvos.length === 0) {
        alert("Planilha sem a coluna apartamento.");
        return;
      }
      // Cruza com os moradores JÁ cadastrados deste condomínio.
      const todos = await api.getEleitores();
      const doCond = todos.results.filter((e) => e.condominio === criado.id);
      const idsPorUnidade = new Map<string, string>();
      for (const e of doCond) {
        const chave = `${normUnidade(e.bloco)}|${normUnidade(e.apartamento)}`;
        if (!idsPorUnidade.has(chave)) idsPorUnidade.set(chave, e.id);
      }
      const idsMarcar = new Set<string>();
      let semMatch = 0;
      for (const a of alvos) {
        const id = idsPorUnidade.get(`${a.nb}|${a.na}`);
        if (id) idsMarcar.add(id);
        else semMatch++;
      }
      let marcadas = 0;
      for (const id of idsMarcar) {
        try {
          await api.setInadimplenciaEleitor(id, true);
          marcadas++;
        } catch {
          /* continua nas demais */
        }
      }
      setInadimplentes((n) => n + marcadas);
      alert(
        `${marcadas} unidade(s) marcada(s) como inadimplente (poderão participar, mas não votar).` +
          (semMatch
            ? `\n${semMatch} não encontrada(s) entre os moradores — importe os moradores primeiro.`
            : "")
      );
    } catch {
      alert("Erro ao processar a planilha de inadimplentes (colunas: bloco, apartamento).");
    } finally {
      setImportandoI(false);
    }
  }

  async function adicionarManual(e: React.FormEvent) {
    e.preventDefault();
    if (!criado) return;
    setAvisoMan("");
    if (!man.nome.trim() || !man.apartamento.trim()) {
      setAvisoMan("Informe ao menos o nome e o apartamento.");
      return;
    }
    setSalvandoMan(true);
    try {
      await api.createEleitor({
        condominio: criado.id,
        nome: man.nome.trim(),
        cpf_hash: "",
        bloco: man.bloco.trim(),
        apartamento: man.apartamento.trim(),
        email: man.email.trim(),
        votos_permitidos: Math.max(1, man.votos_permitidos || 1),
      });
      setMoradores((m) => m + 1);
      setMan({ nome: "", bloco: "", apartamento: "", email: "", votos_permitidos: 1 });
    } catch {
      setAvisoMan("Não foi possível adicionar. Verifique se a unidade já existe.");
    } finally {
      setSalvandoMan(false);
    }
  }

  function baixarModelo(tipo: "moradores" | "inadimplentes") {
    const dados =
      tipo === "moradores"
        ? [
            ["nome", "cpf", "bloco", "apartamento", "email"],
            ["João da Silva", "12345678900", "A", "101", "joao@email.com"],
          ]
        : [
            ["bloco", "apartamento"],
            ["A", "101"],
          ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo);
    XLSX.writeFile(wb, `modelo-${tipo}.xlsx`);
  }

  async function toggleAuto() {
    if (!criado) return;
    try {
      const upd = await api.updateCondominio(criado.id, {
        autocadastro_ativo: !autoAtivo,
      });
      setAutoAtivo(upd.autocadastro_ativo);
    } catch {
      alert("Erro ao alterar o autocadastro.");
    }
  }

  async function copiarLinkAuto() {
    if (!criado) return;
    try {
      let token = autoToken;
      if (!token) {
        const res = await api.gerarLinkAutocadastro(criado.id);
        token = res.autocadastro_token;
        setAutoToken(token);
      }
      await navigator.clipboard.writeText(`${window.location.origin}/autocadastro/${token}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert("Erro ao gerar o link de autocadastro.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary-600" /> Montar condomínio
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Em 3 passos: crie o condomínio, adicione os moradores e está pronto para as reuniões.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8">
        {PASSOS.map((nome, i) => (
          <div key={nome} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold shrink-0 ${
                i < passo
                  ? "bg-green-600 text-white"
                  : i === passo
                  ? "bg-primary-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i < passo ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                i === passo ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {nome}
            </span>
            {i < PASSOS.length - 1 && (
              <div className="flex-1 h-px bg-gray-200 hidden sm:block" />
            )}
          </div>
        ))}
      </div>

      {/* PASSO 1 — Condomínio */}
      {passo === 0 && (
        <form onSubmit={criarCondominio} className="card space-y-4">
          {erro && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do condomínio
            </label>
            <input
              value={cond.nome}
              onChange={(e) => setCond({ ...cond, nome: e.target.value })}
              className="input-field"
              placeholder="Ex.: San Residence"
              required
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CNPJ <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                value={cond.cnpj}
                onChange={(e) => setCond({ ...cond, cnpj: e.target.value })}
                className="input-field"
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total de unidades <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                min={0}
                value={cond.total_unidades || ""}
                onChange={(e) =>
                  setCond({ ...cond, total_unidades: parseInt(e.target.value) || 0 })
                }
                className="input-field"
              />
            </div>
          </div>
          <BlocosEditor
            blocos={cond.blocos}
            onChange={(blocos) => setCond({ ...cond, blocos })}
          />
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={criando} className="btn-primary flex items-center gap-2">
              {criando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Criando...
                </>
              ) : (
                <>
                  Criar e continuar <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* PASSO 2 — Moradores */}
      {passo === 1 && criado && (
        <div className="space-y-4">
          <div className="card bg-primary-50 border-primary-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{criado.nome}</p>
              <p className="text-sm text-gray-600">
                Adicione os moradores de qualquer uma das formas abaixo — pode combinar.
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm">
                <span className="font-bold text-primary-700">{moradores}</span> morador(es)
              </p>
              <p className="text-sm text-red-600">
                <span className="font-bold">{inadimplentes}</span> inadimplente(s)
              </p>
            </div>
          </div>

          {/* Importar moradores */}
          <div className="card">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Importar planilha de moradores</p>
                <p className="text-sm text-gray-500 mb-3">
                  Colunas: <b>nome</b>, <b>cpf</b>, <b>bloco</b>, <b>apartamento</b>, <b>email</b>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => baixarModelo("moradores")} className="btn-secondary flex items-center gap-2 text-sm">
                    <Download className="w-4 h-4" /> Modelo
                  </button>
                  <button
                    onClick={() => fileM.current?.click()}
                    disabled={importandoM}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Upload className="w-4 h-4" /> {importandoM ? "Importando..." : "Escolher planilha"}
                  </button>
                  <input ref={fileM} type="file" accept=".xlsx,.xls,.csv" onChange={importarMoradores} className="hidden" />
                </div>
              </div>
            </div>
          </div>

          {/* Importar inadimplentes */}
          <div className="card">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Importar inadimplentes (opcional)</p>
                <p className="text-sm text-gray-500 mb-3">
                  Colunas: <b>bloco</b>, <b>apartamento</b>. Cruza com os moradores já cadastrados e
                  marca a unidade — ela participa (quórum), mas não vota. Importe os moradores primeiro.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => baixarModelo("inadimplentes")} className="btn-secondary flex items-center gap-2 text-sm">
                    <Download className="w-4 h-4" /> Modelo
                  </button>
                  <button
                    onClick={() => fileI.current?.click()}
                    disabled={importandoI}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Upload className="w-4 h-4" /> {importandoI ? "Cruzando..." : "Escolher planilha"}
                  </button>
                  <input ref={fileI} type="file" accept=".xlsx,.xls,.csv" onChange={importarInadimplentes} className="hidden" />
                </div>
              </div>
            </div>
          </div>

          {/* Cadastro manual */}
          <div className="card">
            <div className="flex items-start gap-3">
              <UserPlus className="w-6 h-6 text-primary-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Adicionar morador manualmente</p>
                <p className="text-sm text-gray-500 mb-3">Um de cada vez, direto aqui.</p>
                {avisoMan && (
                  <div className="mb-2 rounded-lg bg-amber-50 text-amber-700 text-sm px-3 py-2">{avisoMan}</div>
                )}
                <form onSubmit={adicionarManual} className="space-y-2">
                  <input
                    value={man.nome}
                    onChange={(e) => setMan({ ...man, nome: e.target.value })}
                    placeholder="Nome completo"
                    className="input-field"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={man.bloco}
                      onChange={(e) => setMan({ ...man, bloco: e.target.value })}
                      placeholder="Bloco (opcional)"
                      className="input-field"
                    />
                    <input
                      value={man.apartamento}
                      onChange={(e) => setMan({ ...man, apartamento: e.target.value })}
                      placeholder="Apartamento"
                      className="input-field"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={man.email}
                      onChange={(e) => setMan({ ...man, email: e.target.value })}
                      placeholder="E-mail (opcional)"
                      className="input-field"
                    />
                    <input
                      type="number"
                      min={1}
                      value={man.votos_permitidos}
                      onChange={(e) =>
                        setMan({ ...man, votos_permitidos: Math.max(1, Number(e.target.value) || 1) })
                      }
                      title="Votos a que tem direito (unidades)"
                      className="input-field"
                    />
                  </div>
                  <button type="submit" disabled={salvandoMan} className="btn-secondary flex items-center gap-2 text-sm">
                    {salvandoMan ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Adicionar morador
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Autocadastro por link */}
          <div className="card">
            <div className="flex items-start gap-3">
              <Link2 className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Link de autocadastro</p>
                <p className="text-sm text-gray-500 mb-3">
                  Libere e compartilhe: os próprios moradores se cadastram pelo celular.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-sm font-medium text-gray-700">Liberado</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoAtivo}
                      onClick={toggleAuto}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoAtivo ? "bg-primary-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoAtivo ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                  <button
                    type="button"
                    onClick={copiarLinkAuto}
                    disabled={!autoAtivo}
                    className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {copiado ? (
                      <>
                        <Check className="w-4 h-4 text-green-600" /> Link copiado!
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4" /> Copiar link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setPasso(0)} className="btn-secondary flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button onClick={() => setPasso(2)} className="btn-primary flex items-center gap-2">
              Concluir <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASSO 3 — Pronto */}
      {passo === 2 && criado && (
        <div className="card text-center py-10 space-y-5">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold">Condomínio pronto!</h2>
            <p className="text-gray-600 mt-1">
              <b>{criado.nome}</b> — {moradores} morador(es)
              {inadimplentes > 0 && `, ${inadimplentes} inadimplente(s)`}.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link href="/admin/eleitores" className="btn-secondary flex items-center gap-2">
              <Users className="w-4 h-4" /> Ver moradores
            </Link>
            <Link href="/admin/assembleias/nova" className="btn-primary flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> Criar primeira reunião
            </Link>
          </div>
          <button
            onClick={() => router.push("/admin/condominios")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Ir para os condomínios
          </button>
        </div>
      )}
    </div>
  );
}

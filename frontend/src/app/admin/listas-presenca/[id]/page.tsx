"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Printer, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import LinkDestaque from "@/components/LinkDestaque";
import type { ListaPresenca, PresencaManualRegistro } from "@/lib/types";

const FUSO_BRASILIA = "America/Sao_Paulo";

function dataHoraBrasilia(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO_BRASILIA });
}

const PERFIL_LABEL: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  conjuge: "Cônjuge",
  procurador: "Procurador",
  outro: "Outro",
};

const METODO_LABEL: Record<string, string> = {
  selfie: "Selfie",
  facial: "Biometria facial",
  webauthn: "Digital do aparelho",
  otp: "Código por e-mail",
};

export default function RegistrosPresencaPage() {
  const params = useParams();
  const id = params.id as string;
  const [lista, setLista] = useState<ListaPresenca | null>(null);
  const [registros, setRegistros] = useState<PresencaManualRegistro[]>([]);
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState(false);
  const [tituloEdit, setTituloEdit] = useState("");
  const [descricaoEdit, setDescricaoEdit] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getListaPresenca(id), api.getRegistrosPresenca(id)])
      .then(([l, r]) => {
        setLista(l);
        setRegistros(r);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function salvarCabecalho() {
    if (!lista) return;
    setSalvando(true);
    try {
      const atualizada = await api.updateListaPresenca(id, {
        titulo: tituloEdit.trim() || lista.titulo,
        descricao: descricaoEdit,
      });
      setLista(atualizada);
      setEditando(false);
    } catch {
      alert("Não foi possível salvar o cabeçalho.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRegistro(r: PresencaManualRegistro) {
    if (!confirm(`Excluir a presença de "${r.nome}"? A selfie e a assinatura serão apagadas.`)) return;
    try {
      await api.deleteRegistroPresenca(id, r.id);
      setRegistros((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      alert("Não foi possível excluir. Tente novamente.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
        <Link
          href="/admin/listas-presenca"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setTituloEdit(lista?.titulo || "");
              setDescricaoEdit(lista?.descricao || "");
              setEditando(true);
            }}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" /> Editar cabeçalho
          </button>
          <button
            onClick={() => window.print()}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {lista && (
        <div className="card mb-4 border border-orange-200 bg-orange-50 print:hidden">
          <p className="text-sm font-semibold text-orange-900">
            Link da lista de presença para os moradores
          </p>
          <p className="mb-3 text-xs text-orange-800/80">
            Copie e cole no chat do Google Meet ou do Zoom. Use &quot;Ver como
            morador&quot; para conferir como a lista aparece para eles.
          </p>
          <LinkDestaque
            abrirLabel="Abrir lista de presença"
            shareTitle="Lista de presença"
            url={
              lista.codigo_curto
                ? `${
                    typeof window !== "undefined" ? window.location.origin : ""
                  }/v/${lista.codigo_curto}`
                : `${
                    typeof window !== "undefined" ? window.location.origin : ""
                  }/presenca-manual/${id}`
            }
          />
        </div>
      )}

      {editando && (
        <div className="card mb-4 space-y-3 print:hidden">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título
            </label>
            <input
              value={tituloEdit}
              onChange={(e) => setTituloEdit(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Informações (data, horários, tipo da assembleia)
            </label>
            <textarea
              value={descricaoEdit}
              onChange={(e) => setDescricaoEdit(e.target.value)}
              rows={4}
              className="input-field"
              placeholder={"Data: 17/07/2026\nInício: 19:30 · Término: 21:50 (horário de Brasília)\nTipo: assembleia online"}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditando(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={salvarCabecalho}
              disabled={salvando}
              className="btn-primary disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}

      <div className="border-4 border-blue-700 rounded-xl overflow-hidden print:rounded-none">
        <div className="bg-blue-700 text-white text-center px-6 py-5">
          <h1 className="text-xl font-bold uppercase tracking-wide flex items-center justify-center gap-2">
            <Users className="w-6 h-6 shrink-0 print:hidden" />
            {lista?.titulo}
          </h1>
          {lista?.descricao && (
            <p className="text-sm text-blue-100 whitespace-pre-line mt-2">
              {lista.descricao}
            </p>
          )}
        </div>
        <div className="bg-blue-50 border-b-2 border-blue-200 px-6 py-2 text-sm text-blue-900 font-medium text-center">
          Lista de presença · {registros.length} presente
          {registros.length !== 1 ? "s" : ""}
        </div>

        <div className="p-4 bg-white">
          {registros.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              Nenhuma presença registrada ainda.
            </div>
          ) : (
            <div className="divide-y divide-blue-100">
              {registros.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-4 py-3 break-inside-avoid"
                >
                  <span className="w-8 text-sm font-semibold text-blue-700 shrink-0 text-right">
                    {i + 1}.
                  </span>
                  {r.selfie ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.selfie}
                      alt={r.nome}
                      className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100 border border-blue-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{r.nome}</h3>
                    <p className="text-sm text-gray-500">
                      {r.perfil ? `${PERFIL_LABEL[r.perfil] || r.perfil} · ` : ""}
                      {r.bloco ? `Bloco ${r.bloco} · ` : ""}Ap. {r.apartamento}
                    </p>
                    <p className="text-xs text-gray-400">
                      {dataHoraBrasilia(r.criado_em)} (horário de Brasília)
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1 print:hidden">
                      {r.metodo_auth && (
                        <span className="inline-flex items-center rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-green-200">
                          {METODO_LABEL[r.metodo_auth] || r.metodo_auth}
                        </span>
                      )}
                      {(r.marca_aparelho || r.device_info) && (
                        <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                          {r.marca_aparelho || r.device_info}
                        </span>
                      )}
                      {r.ip_address && (
                        <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                          IP {r.ip_address}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.assinatura && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.assinatura}
                      alt="Assinatura"
                      className="h-16 w-28 object-contain shrink-0 border border-gray-200 rounded bg-white"
                    />
                  )}
                  <button
                    onClick={() => excluirRegistro(r)}
                    title="Excluir este registro"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0 print:hidden"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

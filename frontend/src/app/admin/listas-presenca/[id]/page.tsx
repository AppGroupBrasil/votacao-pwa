"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, MapPin, Pencil, Printer, Trash2, Users, Video } from "lucide-react";
import { api } from "@/lib/api";
import LinkDestaque from "@/components/LinkDestaque";
import type { ListaPresenca, PresencaManualRegistro } from "@/lib/types";

const FUSO_BRASILIA = "America/Sao_Paulo";

function dataHoraBrasilia(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO_BRASILIA });
}

function horaBrasilia(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizar(s: string | null | undefined) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
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
  cpf: "CPF",
  cpf_facial: "CPF + rosto",
  webauthn: "Digital do aparelho",
  otp: "Código por e-mail",
};

/**
 * Selo laranja: o motivo pelo qual a mesa precisa olhar este registro. A pessoa
 * já está presente na lista; o que fica pendente é o voto da unidade, liberado
 * no botão "Conferido".
 */
const MOTIVO_LABEL: Record<string, string> = {
  sem_cadastro: "CPF fora da planilha",
  unidade_alterada: "Unidade alterada pelo morador",
  rosto_nao_confere: "Rosto não confirmou",
  rosto_ambiguo: "Rosto parecido com outro",
  sem_cpf: "Entrou sem informar o CPF",
  duplicidade: "Cadastro repetido do mesmo CPF",
};

export default function RegistrosPresencaPage() {
  const params = useParams();
  const id = params.id as string;
  const [lista, setLista] = useState<ListaPresenca | null>(null);
  const [registros, setRegistros] = useState<PresencaManualRegistro[]>([]);
  const [loading, setLoading] = useState(true);

  // Detecta a mesma pessoa marcando presença mais de uma vez. Consideramos
  // duplicado quando coincide: rosto (biometria), nome + unidade ou e-mail.
  const analiseDuplicados = useMemo(() => {
    const n = registros.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };

    const chaveDono = new Map<string, number>();
    registros.forEach((r, i) => {
      const chaves: string[] = [];
      if (r.assinatura_facial) chaves.push(`f:${r.assinatura_facial}`);
      const nome = normalizar(r.nome);
      if (nome) chaves.push(`n:${nome}|${normalizar(r.bloco)}|${normalizar(r.apartamento)}`);
      const email = normalizar(r.email);
      if (email) chaves.push(`e:${email}`);
      for (const c of chaves) {
        const dono = chaveDono.get(c);
        if (dono !== undefined) union(i, dono);
        else chaveDono.set(c, i);
      }
    });

    const gruposMap = new Map<number, number[]>();
    registros.forEach((_, i) => {
      const raiz = find(i);
      const lista = gruposMap.get(raiz);
      if (lista) lista.push(i);
      else gruposMap.set(raiz, [i]);
    });

    const posicaoPorId = new Map<string, { ord: number; total: number }>();
    const grupos = [...gruposMap.values()]
      .filter((idxs) => idxs.length > 1)
      .map((idxs) => {
        const ordenado = [...idxs].sort((a, b) =>
          registros[a].criado_em.localeCompare(registros[b].criado_em)
        );
        ordenado.forEach((idx, k) =>
          posicaoPorId.set(registros[idx].id, { ord: k + 1, total: ordenado.length })
        );
        return ordenado.map((idx) => registros[idx]);
      })
      .sort((a, b) => a[0].nome.localeCompare(b[0].nome));

    return { grupos, posicaoPorId };
  }, [registros]);

  const [conferindo, setConferindo] = useState("");
  const pendentesConferencia = useMemo(
    () => registros.filter((r) => r.conferir_na_mesa).length,
    [registros]
  );
  const [editando, setEditando] = useState(false);
  const [tituloEdit, setTituloEdit] = useState("");
  const [descricaoEdit, setDescricaoEdit] = useState("");
  const [linkSalaEdit, setLinkSalaEdit] = useState("");
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
    // Quem cola o link costuma colar "meet.google.com/..." sem o https://, e
    // o servidor recusa a URL. Completamos aqui para o síndico não travar.
    let link = linkSalaEdit.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;
    setSalvando(true);
    try {
      const atualizada = await api.updateListaPresenca(id, {
        titulo: tituloEdit.trim() || lista.titulo,
        descricao: descricaoEdit,
        link_reuniao: link,
      });
      setLista(atualizada);
      setLinkSalaEdit(atualizada.link_reuniao || "");
      setEditando(false);
    } catch (e: any) {
      const erroLink = e?.response?.data?.link_reuniao;
      alert(
        Array.isArray(erroLink)
          ? `Link da sala: ${erroLink[0]}`
          : "Não foi possível salvar o cabeçalho."
      );
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

  async function conferirRegistro(r: PresencaManualRegistro) {
    if (
      !confirm(
        `Liberar o voto de "${r.nome}" (${r.bloco ? `Bloco ${r.bloco} · ` : ""}Ap. ${r.apartamento})?\n\n` +
          "Confira o documento com o morador antes. Depois de liberado, o voto da unidade passa a contar."
      )
    )
      return;
    setConferindo(r.id);
    try {
      const atualizado = await api.conferirRegistroPresenca(id, r.id);
      setRegistros((prev) => prev.map((x) => (x.id === r.id ? atualizado : x)));
    } catch {
      alert("Não foi possível liberar. Tente novamente.");
    } finally {
      setConferindo("");
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
              setLinkSalaEdit(lista?.link_reuniao || "");
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

      {/* Sala da videochamada: o morador só recebe este link depois de
          concluir a presença — aqui o síndico coloca e confere o endereço. */}
      {lista && !editando && (
        <div className="card mb-4 border border-primary-200 bg-primary-50 print:hidden">
          <p className="text-sm font-semibold text-primary-900 flex items-center gap-2">
            <Video className="w-4 h-4 shrink-0" /> Sala da Assembleia (videochamada)
          </p>
          {lista.link_reuniao ? (
            <>
              <p className="mb-3 text-xs text-primary-800/80">
                O botão &quot;Entrar na sala da Assembleia&quot; aparece para o
                morador assim que ele termina de marcar a presença. Antes disso
                ele não vê este endereço.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={lista.link_reuniao}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                  <Video className="w-4 h-4" /> Entrar na sala
                </a>
                <button
                  onClick={() => {
                    setTituloEdit(lista.titulo || "");
                    setDescricaoEdit(lista.descricao || "");
                    setLinkSalaEdit(lista.link_reuniao || "");
                    setEditando(true);
                  }}
                  className="btn-secondary inline-flex items-center gap-2 text-sm"
                >
                  <Pencil className="w-4 h-4" /> Alterar link
                </button>
                <span className="text-xs text-primary-800/70 break-all">
                  {lista.link_reuniao}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-xs text-primary-800/80">
                Nenhum link cadastrado ainda. Coloque o link do Meet, Zoom ou
                YouTube ao vivo para que o morador receba o botão da sala logo
                depois de marcar a presença.
              </p>
              <button
                onClick={() => {
                  setTituloEdit(lista.titulo || "");
                  setDescricaoEdit(lista.descricao || "");
                  setLinkSalaEdit("");
                  setEditando(true);
                }}
                className="btn-primary inline-flex items-center gap-2 text-sm"
              >
                <Video className="w-4 h-4" /> Colocar o link da sala
              </button>
            </>
          )}
        </div>
      )}

      {analiseDuplicados.grupos.length > 0 && (
        <div className="card mb-4 border border-amber-300 bg-amber-50 print:hidden">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {analiseDuplicados.grupos.length}{" "}
            {analiseDuplicados.grupos.length === 1
              ? "pessoa marcou presença mais de uma vez"
              : "pessoas marcaram presença mais de uma vez"}
          </p>
          <p className="text-xs text-amber-800/80 mt-1 mb-2">
            Consideramos a mesma pessoa quando coincide o rosto (biometria), o nome
            + unidade ou o e-mail. Confira abaixo e use a lixeira para remover as
            marcações repetidas.
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {analiseDuplicados.grupos.map((grupo, gi) => (
              <li key={gi}>
                <span className="font-medium">{grupo[0].nome}</span>
                {grupo[0].apartamento
                  ? ` (${grupo[0].bloco ? `Bloco ${grupo[0].bloco} · ` : ""}Ap. ${grupo[0].apartamento})`
                  : ""}{" "}
                — {grupo.length}×{" "}
                <span className="text-amber-700">
                  ({grupo.map((g) => horaBrasilia(g.criado_em)).join(", ")})
                </span>
              </li>
            ))}
          </ul>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link da sala da assembleia (videochamada)
            </label>
            <input
              value={linkSalaEdit}
              onChange={(e) => setLinkSalaEdit(e.target.value)}
              className="input-field"
              placeholder="https://meet.google.com/abc-defg-hij"
            />
            <p className="mt-1 text-xs text-gray-500">
              Cole aqui o link do Google Meet, Zoom ou YouTube ao vivo. O botão
              para entrar na sala só aparece para o morador depois que ele
              termina de marcar a presença.
            </p>
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

        {pendentesConferencia > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-orange-200 bg-orange-50 px-6 py-3 text-sm text-orange-900 print:hidden">
            <AlertTriangle className="w-5 h-5 shrink-0 text-orange-600" />
            <span>
              <strong>
                {pendentesConferencia} presença
                {pendentesConferencia !== 1 ? "s" : ""} para conferir na mesa.
              </strong>{" "}
              Estão na lista (marcadas em laranja), mas o voto da unidade só
              conta depois que alguém da mesa conferir o documento e tocar em
              &quot;Conferido&quot;.
            </span>
          </div>
        )}

        <div className="p-4 bg-white">
          {registros.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              Nenhuma presença registrada ainda.
            </div>
          ) : (
            <div className="divide-y divide-blue-100">
              {registros.map((r, i) => {
                const dup = analiseDuplicados.posicaoPorId.get(r.id);
                return (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center gap-3 py-3 break-inside-avoid sm:flex-nowrap sm:gap-4 ${
                    r.conferir_na_mesa
                      ? "bg-orange-50 rounded-lg px-2 ring-2 ring-orange-300"
                      : dup
                        ? "bg-amber-50 rounded-lg px-2 ring-1 ring-amber-200"
                        : ""
                  }`}
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
                  {/* Uma linha só enquanto TUDO couber; quando não couber (nome
                      completo longo, CPF, vários selos), o conteúdo quebra
                      sozinho para a linha de baixo — nunca é cortado nem
                      reticenciado. Por isso: flex-wrap no lugar de flex-nowrap
                      e break-words no lugar de truncate. */}
                  <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1 sm:basis-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="text-lg font-semibold break-words">
                        {r.nome}
                      </h3>
                      {dup && dup.total > 1 && (
                        <span className="shrink-0 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
                          {dup.ord}ª de {dup.total}
                        </span>
                      )}
                    </div>
                    <p className="min-w-0 break-words text-base text-gray-600">
                      {r.perfil ? `${PERFIL_LABEL[r.perfil] || r.perfil} · ` : ""}
                      {r.bloco ? `Bloco ${r.bloco} · ` : ""}Ap. {r.apartamento}
                    </p>
                    <p className="min-w-0 break-words text-sm text-gray-500">
                      {dataHoraBrasilia(r.criado_em)} (horário de Brasília)
                    </p>
                    {/* Selos: cada um inteiro (whitespace-nowrap), mas o grupo
                        quebra para a linha seguinte quando não há largura.
                        Sempre encostados à esquerda: quando caem para a linha
                        de baixo, seguem a leitura do nome, não a margem direita. */}
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-1 print:hidden">
                      {r.metodo_auth && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-green-50 px-2 py-0.5 text-sm font-medium text-green-700 ring-1 ring-green-200">
                          {METODO_LABEL[r.metodo_auth] || r.metodo_auth}
                        </span>
                      )}
                      {(r.marca_aparelho || r.device_info) && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">
                          {r.marca_aparelho || r.device_info}
                        </span>
                      )}
                      {r.ip_address && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600">
                          IP {r.ip_address}
                        </span>
                      )}
                      {r.geo_lat != null && r.geo_lng != null && (
                        <a
                          href={`https://www.google.com/maps?q=${r.geo_lat},${r.geo_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver no mapa onde o celular estava"
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-600 hover:bg-gray-200 print:no-underline"
                        >
                          <MapPin className="w-4 h-4" />
                          Localização
                        </a>
                      )}
                      {r.conferir_na_mesa && (
                        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded bg-orange-100 px-2 py-0.5 text-sm font-semibold text-orange-800 ring-1 ring-orange-300">
                          <AlertTriangle className="w-4 h-4" />
                          Conferir na mesa
                          {r.motivo_conferencia
                            ? ` · ${MOTIVO_LABEL[r.motivo_conferencia] || r.motivo_conferencia}`
                            : ""}
                        </span>
                      )}
                      {r.conferir_na_mesa && r.unidade_original && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-orange-50 px-2 py-0.5 text-sm text-orange-800 ring-1 ring-orange-200">
                          Na planilha: {r.unidade_original}
                        </span>
                      )}
                      {!r.conferir_na_mesa && r.conferido_em && (
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-green-50 px-2 py-0.5 text-sm text-green-700 ring-1 ring-green-200">
                          Conferido {horaBrasilia(r.conferido_em)}
                          {r.conferido_por ? ` · ${r.conferido_por}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.conferir_na_mesa && (
                    <button
                      onClick={() => conferirRegistro(r)}
                      disabled={conferindo === r.id}
                      title="Já conferi o documento: liberar o voto desta unidade"
                      className="shrink-0 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 print:hidden"
                    >
                      {conferindo === r.id ? "Liberando..." : "Conferido"}
                    </button>
                  )}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

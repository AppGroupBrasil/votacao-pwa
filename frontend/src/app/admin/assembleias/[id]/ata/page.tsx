"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Link2,
  Sparkles,
  Save,
  Download,
  Printer,
  FileText,
  AlertCircle,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Ata, Assembleia } from "@/lib/types";

export default function AtaAssembleiaPage() {
  const params = useParams();
  const id = params.id as string;

  const [assembleia, setAssembleia] = useState<Assembleia | null>(null);
  const [link, setLink] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const [resumo, setResumo] = useState("");
  const [ataTexto, setAtaTexto] = useState("");
  const [provedor, setProvedor] = useState<"deepseek" | "openai">("deepseek");

  const [loading, setLoading] = useState(true);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");

  function aplicar(a: Ata) {
    setLink(a.link_gravacao);
    setTranscricao(a.transcricao);
    setResumo(a.resumo);
    setAtaTexto(a.ata_texto);
    setProvedor(a.provedor_ia);
  }

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getAssembleia(id), api.getAta(id)])
      .then(([asm, ata]) => {
        setAssembleia(asm);
        aplicar(ata);
      })
      .catch(() => setErro("Não foi possível carregar a ata."))
      .finally(() => setLoading(false));
  }, [id]);

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      await api.salvarAta(id, {
        link_gravacao: link,
        transcricao,
        ata_texto: ataTexto,
        provedor_ia: provedor,
      });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch {
      setErro("Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function transcrever() {
    if (!link.trim()) {
      setErro("Informe o link da gravação para transcrever.");
      return;
    }
    setTranscrevendo(true);
    setErro("");
    try {
      const a = await api.transcreverAta(id, link.trim());
      setTranscricao(a.transcricao);
    } catch (e: any) {
      setErro(
        e?.response?.data?.error ||
          "Não foi possível transcrever. Cole a transcrição manualmente."
      );
    } finally {
      setTranscrevendo(false);
    }
  }

  async function gerar() {
    if (!transcricao.trim()) {
      setErro("Cole a transcrição da gravação antes de gerar a ata.");
      return;
    }
    setGerando(true);
    setErro("");
    try {
      const a = await api.gerarAta(id, { transcricao, provedor_ia: provedor });
      setResumo(a.resumo);
      setAtaTexto(a.ata_texto);
    } catch (e: any) {
      setErro(
        e?.response?.data?.error ||
          "Não foi possível gerar a ata. Verifique as chaves de IA."
      );
    } finally {
      setGerando(false);
    }
  }

  async function baixarPdfOficial() {
    setErro("");
    try {
      const blob = await api.baixarAtaPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ata-${assembleia?.titulo || "assembleia"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível gerar o PDF oficial.");
    }
  }

  function baixarTxt() {
    const blob = new Blob([ataTexto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ata-${assembleia?.titulo || "assembleia"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold">Resumo e Ata</h1>
        <p className="text-sm text-gray-500">{assembleia?.titulo}</p>
      </div>

      {erro && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          <AlertCircle className="w-4 h-4 shrink-0" /> {erro}
        </div>
      )}

      {/* 1. Link da gravação */}
      <div className="card mb-4 print:hidden">
        <label className="flex items-center gap-2 text-sm font-medium mb-2">
          <Link2 className="w-4 h-4 text-slate-500" /> Link da gravação
        </label>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://... (link direto .mp3/.mp4/.m4a)"
          className="input-field w-full"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={transcrever}
            disabled={transcrevendo}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            {transcrevendo ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Transcrevendo...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Transcrever automaticamente
              </>
            )}
          </button>
          <span className="text-xs text-gray-500">
            Link direto de áudio/vídeo. Para YouTube/Drive, cole a transcrição
            abaixo.
          </span>
        </div>
      </div>

      {/* 2. Transcrição */}
      <div className="card mb-4 print:hidden">
        <label className="block text-sm font-medium mb-2">
          Transcrição da gravação
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Cole aqui a transcrição da gravação (ex.: legenda do YouTube ou saída
          do VoxIA). A IA usa este texto para redigir a ata.
        </p>
        <textarea
          value={transcricao}
          onChange={(e) => setTranscricao(e.target.value)}
          rows={8}
          placeholder="Cole a transcrição aqui..."
          className="input-field w-full font-mono text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Gerar com:</span>
            <select
              value={provedor}
              onChange={(e) =>
                setProvedor(e.target.value as "deepseek" | "openai")
              }
              className="input-field py-1.5"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI Mini</option>
            </select>
          </div>
          <button
            onClick={gerar}
            disabled={gerando}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {gerando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Gerar resumo e ata
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. Resumo */}
      {resumo && (
        <div className="card mb-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2 print:text-black">
            Resumo
          </h2>
          <p className="whitespace-pre-wrap text-sm">{resumo}</p>
        </div>
      )}

      {/* 4. Ata editável */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2 print:hidden">
          <label className="text-sm font-medium">Ata (editável)</label>
          <div className="flex items-center gap-2">
            <button
              onClick={salvar}
              disabled={salvando}
              className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-50"
            >
              {salvo ? (
                <>
                  <Check className="w-4 h-4 text-green-600" /> Salvo
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Salvar
                </>
              )}
            </button>
          </div>
        </div>
        <textarea
          value={ataTexto}
          onChange={(e) => setAtaTexto(e.target.value)}
          rows={16}
          placeholder="A ata gerada aparece aqui e pode ser editada antes de exportar."
          className="input-field w-full text-sm print:hidden"
        />
        {/* Versão para impressão/PDF */}
        <div className="hidden print:block whitespace-pre-wrap text-sm leading-relaxed">
          {ataTexto}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          onClick={baixarPdfOficial}
          className="btn-primary flex items-center gap-2"
        >
          <FileText className="w-4 h-4" /> PDF oficial (presença + resultados)
        </button>
        {ataTexto && (
          <>
            <button
              onClick={baixarTxt}
              className="btn-secondary flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Baixar TXT
            </button>
            <button
              onClick={() => window.print()}
              className="btn-secondary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, X, Wand2 } from "lucide-react";

interface BlocosEditorProps {
  blocos: string[];
  onChange: (blocos: string[]) => void;
}

export default function BlocosEditor({ blocos, onChange }: BlocosEditorProps) {
  const [modo, setModo] = useState<"manual" | "lote">("manual");
  const [manual, setManual] = useState("");
  const [prefixo, setPrefixo] = useState("Torre");
  const [inicio, setInicio] = useState(1);
  const [fim, setFim] = useState(10);
  const [padZeros, setPadZeros] = useState(false);

  function adicionar(novos: string[]) {
    const limpos = novos.map((b) => b.trim()).filter(Boolean);
    const merged = [...blocos];
    for (const b of limpos) {
      if (!merged.some((x) => x.toLowerCase() === b.toLowerCase())) merged.push(b);
    }
    onChange(merged);
  }

  function addManual() {
    if (!manual.trim()) return;
    adicionar(manual.split(/[,;\n]/));
    setManual("");
  }

  function gerarSequencia() {
    const de = Math.min(inicio, fim);
    const ate = Math.max(inicio, fim);
    if (ate - de > 500) {
      alert("Intervalo muito grande (máximo de 500 blocos por vez).");
      return;
    }
    const largura = String(ate).length;
    const novos: string[] = [];
    for (let n = de; n <= ate; n++) {
      const num = padZeros ? String(n).padStart(largura, "0") : String(n);
      novos.push(prefixo.trim() ? `${prefixo.trim()} ${num}` : num);
    }
    adicionar(novos);
  }

  function remover(bloco: string) {
    onChange(blocos.filter((b) => b !== bloco));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Blocos / Torres
      </label>

      <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setModo("manual")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            modo === "manual" ? "bg-white shadow font-medium" : "text-gray-600"
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => setModo("lote")}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            modo === "lote" ? "bg-white shadow font-medium" : "text-gray-600"
          }`}
        >
          Em lote
        </button>
      </div>

      {modo === "manual" ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManual();
              }
            }}
            className="input-field"
            placeholder="Digite um bloco e tecle Enter (ex: A, Torre 1)"
          />
          <button
            type="button"
            onClick={addManual}
            className="btn-secondary flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Prefixo
              </label>
              <input
                type="text"
                value={prefixo}
                onChange={(e) => setPrefixo(e.target.value)}
                className="input-field"
                placeholder="Torre, Bloco..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                De
              </label>
              <input
                type="number"
                value={inicio}
                onChange={(e) => setInicio(parseInt(e.target.value) || 0)}
                className="input-field"
                min={0}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Até
              </label>
              <input
                type="number"
                value={fim}
                onChange={(e) => setFim(parseInt(e.target.value) || 0)}
                className="input-field"
                min={0}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={padZeros}
              onChange={(e) => setPadZeros(e.target.checked)}
              className="w-4 h-4 accent-primary-600"
            />
            Numerar com zero à esquerda (01, 02...)
          </label>
          <button
            type="button"
            onClick={gerarSequencia}
            className="btn-secondary flex items-center gap-1.5"
          >
            <Wand2 className="w-4 h-4" />
            Gerar sequência
          </button>
          <p className="text-xs text-gray-400">
            Prévia: {prefixo.trim() ? `${prefixo.trim()} ` : ""}
            {Math.min(inicio, fim)} … {prefixo.trim() ? `${prefixo.trim()} ` : ""}
            {Math.max(inicio, fim)}
          </p>
        </div>
      )}

      {blocos.length > 0 ? (
        <div className="flex flex-wrap gap-2 mt-3">
          {blocos.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-sm px-2.5 py-1 rounded-full"
            >
              {b}
              <button
                type="button"
                onClick={() => remover(b)}
                className="hover:text-primary-900"
                title="Remover"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-3">
          Nenhum bloco adicionado. Deixe vazio se o condomínio não tiver blocos.
        </p>
      )}
    </div>
  );
}

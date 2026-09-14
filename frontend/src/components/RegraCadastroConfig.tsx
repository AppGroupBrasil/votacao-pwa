"use client";

import { AlertTriangle } from "lucide-react";
import RegraCadastroAviso from "@/components/RegraCadastroAviso";
import { OPCOES_ANTECEDENCIA_HORAS, formatarPrazo, prazoDoCadastro } from "@/lib/regraCadastro";

/**
 * Painel do síndico: liga a regra de cadastro antecipado e escolhe quantas horas
 * antes do início o cadastro fecha. Mostra o prazo calculado e o texto exato que
 * o morador vai ler.
 */
export default function RegraCadastroConfig({
  ativo,
  horas,
  dataInicio,
  onChange,
}: {
  ativo: boolean;
  horas: number;
  /** Valor do campo de início (datetime-local ou ISO). */
  dataInicio: string;
  onChange: (valor: { ativo: boolean; horas: number }) => void;
}) {
  const inicioValido = !!dataInicio && !Number.isNaN(new Date(dataInicio).getTime());
  const prazo = inicioValido ? prazoDoCadastro(dataInicio, horas) : null;
  const jaPassou = !!prazo && prazo.getTime() <= Date.now();
  const opcoes = OPCOES_ANTECEDENCIA_HORAS.includes(horas)
    ? OPCOES_ANTECEDENCIA_HORAS
    : [...OPCOES_ANTECEDENCIA_HORAS, horas].sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Somente cadastro com antecedência</p>
          <p className="text-xs text-gray-500">
            Ninguém se cadastra na hora: entra só quem cadastrou o rosto antes do prazo.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ativo}
          aria-label="Somente cadastro com antecedência"
          onClick={() => onChange({ ativo: !ativo, horas })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            ativo ? "bg-primary-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              ativo ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {ativo && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              O cadastro fecha quantas horas antes do início?
            </label>
            <select
              value={horas}
              onChange={(e) => onChange({ ativo, horas: Number(e.target.value) })}
              className="input-field"
            >
              {opcoes.map((h) => (
                <option key={h} value={h}>
                  {h} horas antes
                </option>
              ))}
            </select>
            {prazo && (
              <p className={`mt-1 text-xs ${jaPassou ? "text-red-600" : "text-gray-500"}`}>
                {jaPassou ? (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Com esse prazo o cadastro já estaria fechado ({formatarPrazo(prazo)}).
                    Diminua as horas ou mude o início.
                  </span>
                ) : (
                  <>Cadastro fecha em {formatarPrazo(prazo)}.</>
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Vale para o link de cadastro do rosto, a entrada da votação e a lista de
              presença deste condomínio, até a assembleia ser encerrada.
            </p>
          </div>

          {prazo && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                O que o morador vai ler
              </p>
              <RegraCadastroAviso prazo={prazo} fechado={false} porqueAberto />
            </div>
          )}
        </>
      )}
    </div>
  );
}

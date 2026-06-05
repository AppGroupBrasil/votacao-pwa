"use client";

import { useState } from "react";
import { HelpCircle, X, ChevronLeft, ChevronRight, Check } from "lucide-react";

export interface PassoTutorial {
  titulo: string;
  descricao: string;
}

export interface Tutorial {
  titulo: string;
  passos: PassoTutorial[];
}

// Tutoriais por função do sistema. A chave é usada no <ComoFunciona tutorial="..." />.
export const TUTORIAIS: Record<string, Tutorial> = {
  assembleia: {
    titulo: "Como funciona uma assembleia",
    passos: [
      {
        titulo: "Cadastre os moradores",
        descricao:
          "Em Eleitores, importe a lista por planilha ou cadastre manualmente. Cada morador registra a própria biometria pelo celular no primeiro acesso. Inadimplentes podem ser marcados para bloqueio automático.",
      },
      {
        titulo: "Crie a assembleia",
        descricao:
          "Em Assembleias > Nova, defina título, data, condomínio e o quórum. Adicione as questões (pautas) com suas opções de voto. Salve como rascunho enquanto edita.",
      },
      {
        titulo: "Abra a votação e compartilhe o link",
        descricao:
          "Mude o status para Aberta e envie o link aos moradores (WhatsApp, e-mail ou QR Code). Ao se autenticar pela biometria, a presença é registrada automaticamente.",
      },
      {
        titulo: "Acompanhe e encerre",
        descricao:
          "Use o Controle de votação para ver quem já votou e o painel de Resultados em tempo real. Ao encerrar, gere a ata por IA (a partir da gravação) e exporte os relatórios em PDF.",
      },
    ],
  },
  enquete: {
    titulo: "Como funciona a votação simples",
    passos: [
      {
        titulo: "Crie a enquete",
        descricao:
          "Em Votação Simples, clique em Nova Votação, dê um título e adicione as opções. Escolha entre voto secreto (anônimo) ou aberto (mostra quem votou em cada opção).",
      },
      {
        titulo: "Compartilhe o link",
        descricao:
          "Copie o link público da enquete e envie para os participantes. Não é necessário cadastro nem login para votar.",
      },
      {
        titulo: "Acompanhe o resultado",
        descricao:
          "O resultado aparece em tempo real, com contagem e percentual de cada opção e o vencedor destacado.",
      },
      {
        titulo: "Encerre e exporte",
        descricao:
          "Desative a votação quando quiser parar de receber votos e exporte o resultado em PDF para registro.",
      },
    ],
  },
  "presenca-manual": {
    titulo: "Como funciona a lista de presença manual",
    passos: [
      {
        titulo: "Crie a lista",
        descricao:
          "Em Lista de presença manual, clique em Nova lista e dê um título (ex.: 'Assembleia Ordinária 2026'). A lista já nasce ativa.",
      },
      {
        titulo: "Gere e compartilhe o link público",
        descricao:
          "Copie o link da lista e projete-o em QR Code ou envie ao grupo. Qualquer pessoa abre no celular, sem precisar de cadastro.",
      },
      {
        titulo: "Cada presente preenche no celular",
        descricao:
          "A pessoa tira uma selfie pela câmera, informa nome, bloco e apartamento e assina com o dedo na tela. Ideal para visitantes e quem não tem cadastro.",
      },
      {
        titulo: "Confira os registros",
        descricao:
          "No painel da lista você vê todos os registros com selfie, assinatura, unidade e horário — pronto para anexar à ata.",
      },
    ],
  },
  "controle-votacao": {
    titulo: "Como funciona o controle de votação",
    passos: [
      {
        titulo: "Abra o controle da assembleia",
        descricao:
          "Dentro da assembleia, clique em Controle de votação. A tela é exclusiva do síndico e da administradora.",
      },
      {
        titulo: "Veja quem votou e quem falta",
        descricao:
          "Os cartões no topo mostram total de eleitores, quantos já votaram, quantos faltam e o percentual de participação. A lista detalha o status de cada eleitor.",
      },
      {
        titulo: "Filtre e busque",
        descricao:
          "Use os filtros (Todos / Já votaram / Faltam votar) e a busca por nome, bloco ou apartamento para encontrar rapidamente quem ainda precisa votar.",
      },
      {
        titulo: "Acompanhe em tempo real",
        descricao:
          "A tela atualiza sozinha a cada poucos segundos. O voto é secreto: você nunca vê em qual opção a pessoa votou, apenas se já votou.",
      },
    ],
  },
};

export default function ComoFunciona({ tutorial }: { tutorial: keyof typeof TUTORIAIS }) {
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState(0);
  const dados = TUTORIAIS[tutorial];

  if (!dados) return null;

  const total = dados.passos.length;
  const atual = dados.passos[passo];
  const ultimo = passo === total - 1;

  const abrir = () => {
    setPasso(0);
    setAberto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        <HelpCircle className="w-4 h-4" />
        Como funciona
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-lg">{dados.titulo}</h3>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-6">
              {/* Indicador de passos */}
              <div className="flex items-center gap-2 mb-6">
                {dados.passos.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= passo ? "bg-primary-600" : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center">
                  {passo + 1}
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Passo {passo + 1} de {total}
                  </p>
                  <h4 className="font-semibold text-lg mb-2">{atual.titulo}</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {atual.descricao}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={() => setPasso((p) => Math.max(0, p - 1))}
                disabled={passo === 0}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:text-gray-800"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>

              {ultimo ? (
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="inline-flex items-center gap-1 text-sm font-semibold bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
                >
                  <Check className="w-4 h-4" /> Entendi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPasso((p) => Math.min(total - 1, p + 1))}
                  className="inline-flex items-center gap-1 text-sm font-semibold bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700"
                >
                  Próximo <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

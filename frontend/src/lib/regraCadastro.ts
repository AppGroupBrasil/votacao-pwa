/**
 * Regra "somente cadastro com antecedência": textos e prazo, iguais em todas as
 * telas (painel do síndico, link de cadastro, votação e lista de presença).
 */

export type RegraCadastro = {
  assembleia_id: string;
  assembleia_titulo: string;
  /** ISO: quando o cadastro do rosto fecha. */
  prazo: string;
  fechado: boolean;
};

export const OPCOES_ANTECEDENCIA_HORAS = [2, 6, 12, 24, 48, 72];

export function formatarPrazo(prazo: string | Date): string {
  const d = typeof prazo === "string" ? new Date(prazo) : prazo;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

export function prazoDoCadastro(dataInicio: string | Date, horas: number): Date {
  const inicio = typeof dataInicio === "string" ? new Date(dataInicio) : dataInicio;
  return new Date(inicio.getTime() - horas * 60 * 60 * 1000);
}

export function textoRegra(prazo: string | Date, fechado: boolean) {
  const quando = formatarPrazo(prazo);
  return fechado
    ? {
        titulo: "Cadastro encerrado",
        texto: `O prazo terminou em ${quando}. Só participa quem se cadastrou com antecedência. Procure a administração do condomínio.`,
      }
    : {
        titulo: "Cadastro somente com antecedência",
        texto: `Para participar desta assembleia, cadastre seu rosto até ${quando}. Depois disso, inclusive durante a assembleia, não será possível se cadastrar.`,
      };
}

export const POR_QUE_TITULO = "Por que o cadastro é antecipado?";
export const POR_QUE_INTRO = "Com os cadastros feitos antes, a administração confere com calma:";
export const POR_QUE_ITENS = [
  "se quem se cadastrou é proprietário da unidade;",
  "se não for, se tem procuração;",
  "se a unidade está inadimplente — o voto já fica bloqueado.",
];
export const POR_QUE_FECHO =
  "No dia, é só confirmar o rosto e votar: mais organização e agilidade para todos.";

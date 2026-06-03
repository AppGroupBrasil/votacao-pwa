// === Condomínios ===
export interface Condominio {
  id: string;
  nome: string;
  cnpj: string;
  total_unidades: number;
  adimplente: boolean;
  blocos: string[];
  autocadastro_ativo: boolean;
  autocadastro_token: string | null;
  criado_em: string;
  atualizado_em: string;
}

// === Eleitores ===
export interface Eleitor {
  id: string;
  condominio: string;
  condominio_nome: string;
  nome: string;
  cpf_hash: string;
  bloco: string;
  apartamento: string;
  perfil: "proprietario" | "procurador";
  email: string;
  cadastro_completo: boolean;
  bloqueado: boolean;
  inadimplente: boolean;
  criado_em: string;
  atualizado_em: string;
}

// === Assembleias ===
export interface OpcaoVoto {
  id: string;
  texto: string;
  ordem: number;
  imagem_url: string | null;
  arquivo_url: string | null;
  link_externo: string;
}

export interface Questao {
  id: string;
  titulo: string;
  descricao: string;
  ordem: number;
  opcoes: OpcaoVoto[];
}

export interface Presenca {
  id: string;
  eleitor: string | null;
  nome: string;
  bloco: string;
  apartamento: string;
  perfil: "proprietario" | "procurador";
  metodo_auth: string;
  assinatura_facial: string;
  ip_address: string | null;
  device_info: string;
  user_agent: string;
  horario_entrada: string;
}

export interface Quorum {
  base_eleitores: number;
  presentes: number;
  percentual: number;
  necessario_primeira: number;
  necessario_segunda: number;
  atingido_primeira: boolean;
  atingido_segunda: boolean;
  regra_primeira: string;
  regra_segunda: string;
}

export interface LogAuditoria {
  id: string;
  acao: string;
  acao_display: string;
  descricao: string;
  ator: string;
  ip_address: string | null;
  criado_em: string;
}

export interface Assembleia {
  id: string;
  condominio: string;
  condominio_nome: string;
  titulo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  status: "rascunho" | "aberta" | "encerrada";
  quorum_minimo: number;
  primeira_chamada_50_mais_1: boolean;
  quorum_segunda_chamada: number;
  segunda_chamada_qualquer_numero: boolean;
  total_votantes: number;
  total_presentes: number;
  quorum: Quorum;
  questoes: Questao[];
  presencas: Presenca[];
  criado_em: string;
  atualizado_em: string;
}

export interface AssembleiaListItem {
  id: string;
  condominio: string;
  condominio_nome: string;
  titulo: string;
  data_inicio: string;
  data_fim: string;
  status: "rascunho" | "aberta" | "encerrada";
  quorum_minimo: number;
  primeira_chamada_50_mais_1: boolean;
  quorum_segunda_chamada: number;
  segunda_chamada_qualquer_numero: boolean;
  total_votantes: number;
  total_questoes: number;
  criado_em: string;
}

// === Ata / Resumo ===
export interface Ata {
  id: string;
  assembleia: string;
  link_gravacao: string;
  transcricao: string;
  resumo: string;
  ata_texto: string;
  provedor_ia: "deepseek" | "openai";
  status: "pendente" | "transcrevendo" | "transcrita" | "gerando" | "pronta" | "erro";
  erro_mensagem: string;
  criado_em: string;
  atualizado_em: string;
}

// === Votos ===
export interface VotoPayload {
  eleitor_id: string;
  questao_id: string;
  opcao_id: string;
  auth_token: string;
  device_id?: string;
  por_procuracao?: boolean;
}

export interface VotoResponse {
  message: string;
  hash_voto: string;
  timestamp: string;
}

export interface OpcaoResultado {
  id: string;
  texto: string;
  votos: number;
}

export interface Resultado {
  questao_id: string;
  questao_titulo: string;
  total_votos: number;
  total_votantes: number;
  percentual_participacao: number;
  opcoes: OpcaoResultado[];
  procuracoes_pendentes: number;
}

export interface UnidadeVotante {
  id: string;
  nome: string;
  bloco: string;
  apartamento: string;
}

export interface ProcuracaoPendente {
  eleitor_id: string;
  nome: string;
  bloco: string;
  apartamento: string;
  procurador_nome: string;
  horario: string;
  votos: { questao: string; opcao: string }[];
}

export interface RelatorioVotoItem {
  id: string;
  eleitor_nome: string;
  bloco: string;
  apartamento: string;
  perfil: "proprietario" | "procurador";
  por_procuracao: boolean;
  questao_titulo: string;
  opcao_texto: string;
  tipo_autenticacao: "facial" | "webauthn" | "otp";
  ip_address: string;
  device_info: string;
  user_agent: string;
  timestamp: string;
  hash_voto: string;
}

export interface RelatorioVotoResponse {
  assembleia_id: string;
  assembleia_titulo: string;
  total_registros: number;
  votos: RelatorioVotoItem[];
}

// === Enquetes (votação simples / anônima) ===
export interface EnqueteOpcaoItem {
  id: string;
  texto: string;
  ordem: number;
}

export interface Enquete {
  id: string;
  condominio: string | null;
  titulo: string;
  ativa: boolean;
  voto_aberto: boolean;
  criado_em: string;
  opcoes: EnqueteOpcaoItem[];
  total_votos: number;
}

export interface ControleVotacaoEleitor {
  eleitor_id: string;
  nome: string;
  bloco: string;
  apartamento: string;
  respondidas: number;
  votou: boolean;
  completo: boolean;
  pendente: boolean;
  ultimo_voto: string | null;
}

export interface ControleVotacao {
  total_questoes: number;
  resumo: {
    total_eleitores: number;
    votaram: number;
    completos: number;
    faltam: number;
    percentual: number;
  };
  eleitores: ControleVotacaoEleitor[];
}

export interface ListaPresenca {
  id: string;
  condominio: string | null;
  titulo: string;
  ativa: boolean;
  criado_em: string;
  total_registros: number;
}

export interface PresencaManualRegistro {
  id: string;
  nome: string;
  bloco: string;
  apartamento: string;
  selfie: string;
  assinatura: string;
  criado_em: string;
}

export interface EnquetePublica {
  id: string;
  titulo: string;
  ativa: boolean;
  voto_aberto: boolean;
  opcoes: { id: string; texto: string }[];
}

export interface EnqueteVotante {
  nome: string;
  bloco: string;
  apartamento: string;
  horario: string;
}

export interface EnqueteResultadoOpcao {
  id: string;
  texto: string;
  votos: number;
  percentual: number;
  votantes?: EnqueteVotante[];
}

export interface EnqueteResultado {
  id: string;
  titulo: string;
  ativa: boolean;
  voto_aberto: boolean;
  total_votos: number;
  opcoes: EnqueteResultadoOpcao[];
  vencedor: EnqueteResultadoOpcao | null;
}

// === Auth ===
export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  role: "master" | "administradora" | "sindico" | null;
  condominios_ids: string[];
}

export interface MasterDashboard {
  total_usuarios: number;
  total_condominios: number;
  condominios_adimplentes: number;
  condominios_inadimplentes: number;
}

export interface MasterUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  total_condominios: number;
  role: "master" | "administradora" | "sindico" | null;
  condominios_ids: string[];
}

// === Paginated ===
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

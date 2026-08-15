import type {
  Assembleia,
  AssembleiaListItem,
  Ata,
  Condominio,
  Eleitor,
  LogAuditoria,
  MasterDashboard,
  MasterUser,
  PaginatedResponse,
  Presenca,
  Questao,
  Resultado,
  RelatorioVotoResponse,
  User,
  VotoPayload,
  VotoResponse,
} from "./types";

export interface EleitorSession {
  session_token?: string;
  eleitor_id: string;
  nome: string;
  bloco: string;
  apartamento: string;
  perfil: string;
  condominio_id: string;
  precisa_trocar_senha: boolean;
  precisa_biometria: boolean;
  inadimplente: boolean;
  login?: string;
  ok?: boolean;
}

export interface EleitorPresencaResponse {
  assembleia_id: string;
  assembleia_titulo: string;
  total_presentes: number;
  presencas: {
    nome: string;
    bloco: string;
    apartamento: string;
    perfil: string;
    horario_entrada: string;
    eu: boolean;
  }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

// Identificador persistente do dispositivo: impede que o mesmo aparelho
// vote em mais de uma conta na mesma assembleia (evita compartilhar login).
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("device_id");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("device_id", id);
  }
  return id;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });

  let res = await doFetch();

  const skipRefresh =
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/refresh");

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(`HTTP ${res.status}`) as any;
    error.response = { data: body, status: res.status };
    throw error;
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh/`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const api = {
  // Auth
  login: (username: string, password: string, remember = false) =>
    request<User>("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password, remember }),
    }),

  logout: () =>
    request<{ logged_out: boolean }>("/auth/logout/", { method: "POST" }),

  me: () => request<User>("/auth/me/"),

  updateMe: (data: { first_name?: string; last_name?: string; email?: string; new_password?: string }) =>
    request<User>("/auth/me/", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteMe: () =>
    request<void>("/auth/me/", {
      method: "DELETE",
    }),

  // Condomínios
  getCondominios: () =>
    request<PaginatedResponse<Condominio>>("/condominios/"),

  getCondominio: (id: string) => request<Condominio>(`/condominios/${id}/`),

  createCondominio: (data: Partial<Condominio>) =>
    request<Condominio>("/condominios/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCondominio: (id: string, data: Partial<Condominio>) =>
    request<Condominio>(`/condominios/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  gerarLinkAutocadastro: (condominioId: string) =>
    request<{ autocadastro_token: string }>(
      `/condominios/${condominioId}/autocadastro-link/`,
      { method: "POST" }
    ),

  getAutocadastro: (token: string) =>
    request<{ condominio_nome: string; blocos: string[] }>(
      `/eleitores/autocadastro/${token}/`
    ),

  autocadastrar: (
    token: string,
    data: { nome: string; cpf_hash: string; bloco?: string; apartamento: string; email: string }
  ) =>
    request<{ message: string; token: string }>(
      `/eleitores/autocadastro/${token}/`,
      { method: "POST", body: JSON.stringify(data) }
    ),

  autocadastroJaCadastradoSolicitar: (token: string, email: string) =>
    request<{ sent: boolean; email_masked: string }>(
      `/eleitores/autocadastro/${token}/ja-cadastrado/solicitar/`,
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  autocadastroJaCadastradoConfirmar: (token: string, email: string, code: string) =>
    request<{ token: string }>(
      `/eleitores/autocadastro/${token}/ja-cadastrado/confirmar/`,
      { method: "POST", body: JSON.stringify({ email, code }) }
    ),

  // Eleitores
  getEleitores: async () => {
    const all: Eleitor[] = [];
    let page = 1;
    for (;;) {
      const d = await request<PaginatedResponse<Eleitor>>(`/eleitores/?page=${page}`);
      const results = ((d as any).results ?? d) as Eleitor[];
      all.push(...results);
      if (!(d as any).next) break;
      page += 1;
    }
    return { count: all.length, next: null, previous: null, results: all } as PaginatedResponse<Eleitor>;
  },

  createEleitor: (data: Partial<Eleitor>) =>
    request<Eleitor>("/eleitores/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  bulkCreateEleitores: (
    condominio: string,
    eleitores: { nome: string; cpf_hash: string; bloco?: string; apartamento: string; email: string }[]
  ) =>
    request<{ criados: number; pulados: number; erros: { linha: number; erros: Record<string, string[]> }[] }>(
      "/eleitores/bulk/",
      {
        method: "POST",
        body: JSON.stringify({ condominio, eleitores }),
      }
    ),

  getEleitor: (id: string) => request<Eleitor>(`/eleitores/${id}/`),

  updateEleitor: (id: string, data: Partial<Eleitor>) =>
    request<Eleitor>(`/eleitores/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteEleitor: (id: string) =>
    request<void>(`/eleitores/${id}/`, { method: "DELETE" }),

  setBloqueioEleitor: (id: string, bloqueado: boolean) =>
    request<{ bloqueado: boolean }>(`/eleitores/${id}/bloqueio/`, {
      method: "POST",
      body: JSON.stringify({ bloqueado }),
    }),

  setInadimplenciaEleitor: (id: string, inadimplente: boolean) =>
    request<{ inadimplente: boolean; afetados: string[] }>(
      `/eleitores/${id}/inadimplencia/`,
      { method: "POST", body: JSON.stringify({ inadimplente }) }
    ),

  enviarConvite: (eleitorId: string) =>
    request<{ message: string; token: string; url: string }>(
      `/eleitores/${eleitorId}/enviar-convite/`,
      { method: "POST" }
    ),

  validarConvite: (token: string) =>
    request<{
      id: string;
      nome: string;
      apartamento: string;
      cadastro_completo: boolean;
    }>(`/eleitores/convite/${token}/`),

  onboarding: (
    token: string,
    data: { biometria_hash: string; webauthn_credential?: any }
  ) =>
    request<{ message: string }>(`/eleitores/onboarding/${token}/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Assembleias
  getAssembleias: () =>
    request<PaginatedResponse<AssembleiaListItem>>("/assembleias/"),

  getAssembleia: (id: string) =>
    request<Assembleia>(`/assembleias/${id}/`),

  getAssembleiaPublic: (id: string) =>
    request<Assembleia>(`/votos/${id}/votacao/`),

  // questao_id só vem quando o código é de um item específico da assembleia.
  resolverCodigo: (codigo: string) =>
    request<{ assembleia_id: string; questao_id?: string }>(
      `/assembleias/resolver/${codigo}/`
    ),

  resolverCodigoEnquete: (codigo: string) =>
    request<{ enquete_id: string }>(`/enquetes/resolver/${codigo}/`),

  resolverCodigoLista: (codigo: string) =>
    request<{ lista_id: string; modo_rapido?: boolean }>(
      `/enquetes/listas-presenca/resolver/${codigo}/`
    ),

  createAssembleia: (data: Partial<Assembleia>) =>
    request<Assembleia>("/assembleias/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAssembleia: (id: string, data: Partial<Assembleia>) =>
    request<Assembleia>(`/assembleias/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAssembleia: (id: string) =>
    request<void>(`/assembleias/${id}/`, {
      method: "DELETE",
    }),

  abrirAssembleia: (id: string) =>
    request<Assembleia>(`/assembleias/${id}/abrir/`, { method: "POST" }),

  liberarVotacao: (id: string, liberar: boolean) =>
    request<Assembleia>(`/assembleias/${id}/liberar-votacao/`, {
      method: "POST",
      body: JSON.stringify({ liberar }),
    }),

  encerrarAssembleia: (id: string) =>
    request<Assembleia>(`/assembleias/${id}/encerrar/`, { method: "POST" }),

  reabrirAssembleia: (id: string) =>
    request<Assembleia>(`/assembleias/${id}/reabrir/`, { method: "POST" }),

  marcarPresenca: (
    assembleiaId: string,
    data: { eleitor_id: string } | { nome: string; apartamento: string; bloco?: string }
  ) =>
    request<Presenca>(`/assembleias/${assembleiaId}/marcar-presenca/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  marcarPresencaInadimplente: (
    assembleiaId: string,
    presencaId: string,
    inadimplente: boolean
  ) =>
    request<Presenca>(`/assembleias/${assembleiaId}/marcar-inadimplente/`, {
      method: "POST",
      body: JSON.stringify({ presenca_id: presencaId, inadimplente }),
    }),

  // Ata / Resumo
  getAta: (assembleiaId: string) =>
    request<Ata>(`/assembleias/${assembleiaId}/ata/`),

  salvarAta: (
    assembleiaId: string,
    data: Partial<
      Pick<Ata, "link_gravacao" | "transcricao" | "ata_texto" | "provedor_ia">
    >
  ) =>
    request<Ata>(`/assembleias/${assembleiaId}/ata/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  baixarAtaPdf: async (assembleiaId: string) => {
    const res = await fetch(`${API_URL}/assembleias/${assembleiaId}/ata-pdf/`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Falha ao gerar o PDF da ata.");
    return res.blob();
  },

  // Os três relatórios oficiais da assembleia, todos em PDF.
  baixarRelatorioPdf: async (
    assembleiaId: string,
    tipo: "presenca" | "votacao" | "resultado",
  ) => {
    const res = await fetch(
      `${API_URL}/assembleias/${assembleiaId}/relatorio-${tipo}-pdf/`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("Falha ao gerar o PDF do relatório.");
    return res.blob();
  },

  transcreverAta: (assembleiaId: string, linkGravacao?: string) =>
    request<Ata>(`/assembleias/${assembleiaId}/transcrever/`, {
      method: "POST",
      body: JSON.stringify(linkGravacao ? { link_gravacao: linkGravacao } : {}),
    }),

  getLogsAuditoria: (assembleiaId: string) =>
    request<LogAuditoria[]>(`/assembleias/${assembleiaId}/logs/`),

  gerarAta: (
    assembleiaId: string,
    data?: { transcricao?: string; provedor_ia?: "deepseek" | "openai" }
  ) =>
    request<Ata>(`/assembleias/${assembleiaId}/gerar-ata/`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  // Questões
  createQuestao: (assembleiaId: string, data: {
    titulo: string;
    descricao: string;
    ordem: number;
    opcoes: { texto: string; ordem: number; link_externo?: string }[];
    opcaoImagens?: (File | null)[];
    opcaoArquivos?: (File | null)[];
  }) => {
    const formData = new FormData();
    formData.append("titulo", data.titulo);
    formData.append("descricao", data.descricao);
    formData.append("ordem", String(data.ordem));
    formData.append("opcoes_json", JSON.stringify(data.opcoes));
    data.opcaoImagens?.forEach((f, i) => { if (f) formData.append(`opcao_imagem_${i}`, f); });
    data.opcaoArquivos?.forEach((f, i) => { if (f) formData.append(`opcao_arquivo_${i}`, f); });
    return request<Questao>(`/assembleias/${assembleiaId}/questoes/`, {
      method: "POST",
      body: formData,
    });
  },

  deleteQuestao: (assembleiaId: string, questaoId: string) =>
    request<void>(`/assembleias/${assembleiaId}/questoes/${questaoId}/`, {
      method: "DELETE",
    }),

  updateQuestao: (assembleiaId: string, questaoId: string, data: {
    titulo?: string;
    descricao?: string;
    opcoes?: { texto: string; ordem: number; link_externo?: string }[];
    opcaoImagens?: (File | null)[];
    opcaoArquivos?: (File | null)[];
  }) => {
    const formData = new FormData();
    if (data.titulo !== undefined) formData.append("titulo", data.titulo);
    if (data.descricao !== undefined) formData.append("descricao", data.descricao);
    if (data.opcoes) formData.append("opcoes_json", JSON.stringify(data.opcoes));
    data.opcaoImagens?.forEach((f, i) => { if (f) formData.append(`opcao_imagem_${i}`, f); });
    data.opcaoArquivos?.forEach((f, i) => { if (f) formData.append(`opcao_arquivo_${i}`, f); });
    return request<Questao>(`/assembleias/${assembleiaId}/questoes/${questaoId}/`, {
      method: "PATCH",
      body: formData,
    });
  },

  // Votos
  registrarPresenca: (
    assembleiaId: string,
    authToken: string,
    captura?: import("./types").CapturaIdentidade
  ) =>
    request<{ registrado: boolean; novo: boolean; horario_entrada: string }>(
      `/votos/${assembleiaId}/presenca/`,
      {
        method: "POST",
        body: JSON.stringify({ auth_token: authToken, ...(captura || {}) }),
      }
    ),

  // Fotos (selfie/assinatura) das presenças, à parte da listagem para não pesar
  // o polling. ids limita ao que ainda não foi baixado.
  getPresencasCaptura: (assembleiaId: string, ids?: string[]) =>
    request<{ capturas: { id: string; selfie: string; assinatura: string }[] }>(
      `/votos/${assembleiaId}/presencas-captura/` +
        (ids && ids.length ? `?ids=${ids.join(",")}` : "")
    ),

  votar: (assembleiaId: string, data: VotoPayload) =>
    request<VotoResponse>(`/votos/${assembleiaId}/votar/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getResultados: (assembleiaId: string) =>
    request<Resultado[]>(`/votos/${assembleiaId}/resultados/`),

  getUnidades: (assembleiaId: string) =>
    request<import("./types").UnidadeVotante[]>(
      `/votos/${assembleiaId}/unidades/`
    ),

  // Itens em que este votante já votou (1 voto por item/link).
  getQuestoesVotadas: (assembleiaId: string, authToken: string) =>
    request<{ questoes: string[]; por_unidade: string[] }>(
      `/votos/${assembleiaId}/ja-votadas/?auth_token=${encodeURIComponent(authToken)}`
    ),

  acessoManualVotacao: (
    assembleiaId: string,
    data: {
      nome: string;
      bloco?: string;
      apartamento: string;
      selfie: string;
      device_id?: string;
    }
  ) =>
    request<{
      authenticated: boolean;
      method: string;
      votante_manual_id: string;
      aviso_unidade?: string;
      token: string;
    }>(`/votos/${assembleiaId}/acesso-manual/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  consultarCpfVotacao: (assembleiaId: string, cpfHash: string) =>
    request<{
      unidades: {
        nome: string;
        bloco: string;
        apartamento: string;
        perfil?: string;
      }[];
      encontrado?: boolean;
      tem_rosto?: boolean;
      mensagem?: string;
    }>(`/votos/${assembleiaId}/consultar-cpf/`, {
      method: "POST",
      body: JSON.stringify({ cpf_hash: cpfHash }),
    }),

  acessoFacialVotacao: (
    assembleiaId: string,
    data: {
      descriptor?: number[];
      descriptors?: number[][];
      cpf_hash?: string;
      nome?: string;
      bloco?: string;
      apartamento?: string;
      perfil?: string;
      selfie?: string;
      consentimento_lgpd?: boolean;
      device_id?: string;
    }
  ) =>
    request<{
      encontrado: boolean;
      authenticated?: boolean;
      method?: string;
      novo?: boolean;
      nome?: string;
      votante_manual_id?: string;
      aviso_unidade?: string;
      conferir_na_mesa?: boolean;
      motivo_conferencia?: string;
      aviso_conferencia?: string;
      token?: string;
    }>(`/votos/${assembleiaId}/acesso-facial/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getVotosManuais: (assembleiaId: string) =>
    request<{
      total: number;
      votantes: import("./types").VotanteManualAdmin[];
    }>(`/votos/${assembleiaId}/votos-manuais/`),

  validarVotoManual: (
    assembleiaId: string,
    votanteManualId: string,
    acao:
      | "aprovar"
      | "rejeitar"
      | "inadimplente"
      | "regularizar"
      | "conferir"
  ) =>
    request<{ status: string; votos_atualizados: number }>(
      `/votos/${assembleiaId}/votos-manuais/validar/`,
      {
        method: "POST",
        body: JSON.stringify({ votante_manual_id: votanteManualId, acao }),
      }
    ),

  getProcuracoesPendentes: (assembleiaId: string) =>
    request<{
      total_unidades: number;
      unidades: import("./types").ProcuracaoPendente[];
    }>(`/votos/${assembleiaId}/procuracoes/`),

  validarProcuracao: (
    assembleiaId: string,
    alvo: { tipo: "procuracao" | "declarada"; id: string },
    acao: "aprovar" | "rejeitar"
  ) =>
    request<{ status: string; votos_atualizados: number }>(
      `/votos/${assembleiaId}/procuracoes/validar/`,
      {
        method: "POST",
        body: JSON.stringify(
          alvo.tipo === "declarada"
            ? { grupo_declaracao: alvo.id, acao }
            : { eleitor_id: alvo.id, acao }
        ),
      }
    ),

  getRelatorioVotos: (assembleiaId: string) =>
    request<RelatorioVotoResponse>(`/votos/${assembleiaId}/relatorio/`),

  verificarVoto: (hash: string) =>
    request<{
      encontrado: boolean;
      timestamp?: string;
      assembleia?: string;
      questao?: string;
      status?: string;
    }>(`/votos/verificar/?hash=${encodeURIComponent(hash)}`),

  // WebAuthn
  webauthnRegisterOptions: (eleitorId: string) =>
    request<any>("/webauthn/register/options/", {
      method: "POST",
      body: JSON.stringify({ eleitor_id: eleitorId }),
    }),

  webauthnRegisterVerify: (eleitorId: string, credential: any) =>
    request<{ message: string }>("/webauthn/register/verify/", {
      method: "POST",
      body: JSON.stringify({ eleitor_id: eleitorId, credential }),
    }),

  webauthnAuthOptions: (eleitorId: string) =>
    request<any>("/webauthn/auth/options/", {
      method: "POST",
      body: JSON.stringify({ eleitor_id: eleitorId }),
    }),

  webauthnAuthVerify: (eleitorId: string, assembleiaId: string, credential: any) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/webauthn/auth/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, credential }),
      }
    ),

  // Biometria Facial
  facialAuthVerify: (eleitorId: string, assembleiaId: string, hash: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/biometria/auth/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, hash }),
      }
    ),

  // Selfie (degrau da escada: sem conferência, conta na hora; foto para auditoria)
  selfieAuthVerify: (eleitorId: string, assembleiaId: string, selfie: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/selfie/auth/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, selfie }),
      }
    ),

  // OTP
  otpSend: (eleitorId: string, assembleiaId: string) =>
    request<{ sent: boolean; email_masked: string }>("/otp/send/", {
      method: "POST",
      body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId }),
    }),

  otpVerify: (eleitorId: string, assembleiaId: string, code: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/otp/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, code }),
      }
    ),

  otpSendEmail: (email: string, assembleiaId: string) =>
    request<{ sent: boolean; email_masked: string }>("/otp/send-email/", {
      method: "POST",
      body: JSON.stringify({ email, assembleia_id: assembleiaId }),
    }),

  otpAcessoDireto: (email: string, assembleiaId: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/otp/acesso-direto/",
      {
        method: "POST",
        body: JSON.stringify({ email, assembleia_id: assembleiaId }),
      }
    ),

  otpVerifyEmail: (email: string, assembleiaId: string, code: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; votos_permitidos: number; token: string }>(
      "/otp/verify-email/",
      {
        method: "POST",
        body: JSON.stringify({ email, assembleia_id: assembleiaId, code }),
      }
    ),

  encerrarQuestao: (assembleiaId: string, questaoId: string, encerrar: boolean) =>
    request<Questao>(`/assembleias/${assembleiaId}/questoes/${questaoId}/encerrar/`, {
      method: "POST",
      body: JSON.stringify({ encerrar }),
    }),

  liberarQuestao: (assembleiaId: string, questaoId: string, liberar: boolean) =>
    request<Questao>(`/assembleias/${assembleiaId}/questoes/${questaoId}/liberar/`, {
      method: "POST",
      body: JSON.stringify({ liberar }),
    }),

  // Register & Password Reset
  register: (data: {
    username: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) =>
    request<User>("/auth/register/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  requestPasswordReset: (email: string) =>
    request<{ sent: boolean }>("/auth/password-reset/", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  confirmPasswordReset: (uid: string, token: string, new_password: string) =>
    request<{ reset: boolean }>("/auth/password-reset/confirm/", {
      method: "POST",
      body: JSON.stringify({ uid, token, new_password }),
    }),

  // Enquetes (votação simples / anônima)
  getEnquetes: () =>
    request<
      import("./types").PaginatedResponse<import("./types").Enquete>
    >("/enquetes/"),

  createEnquete: (
    titulo: string,
    opcoes_texto: string[],
    opts?: {
      voto_aberto?: boolean;
      exige_identificacao?: boolean;
      condominio?: string;
    }
  ) =>
    request<import("./types").Enquete>("/enquetes/", {
      method: "POST",
      body: JSON.stringify({
        titulo,
        opcoes_texto,
        voto_aberto: opts?.voto_aberto ?? false,
        exige_identificacao: opts?.exige_identificacao ?? false,
        condominio: opts?.condominio ?? null,
      }),
    }),

  updateEnquete: (
    id: string,
    data: Partial<{
      titulo: string;
      ativa: boolean;
      voto_aberto: boolean;
      exige_identificacao: boolean;
      opcoes_texto: string[];
    }>
  ) =>
    request<import("./types").Enquete>(`/enquetes/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteEnquete: (id: string) =>
    request<void>(`/enquetes/${id}/`, { method: "DELETE" }),

  getEnquetePublica: (id: string) =>
    request<import("./types").EnquetePublica>(`/enquetes/${id}/publica/`),

  getEnqueteResultado: (id: string) =>
    request<import("./types").EnqueteResultado>(`/enquetes/${id}/resultado/`),

  votarEnquete: (
    id: string,
    opcaoId: string,
    votante?: {
      nome: string;
      bloco?: string;
      apartamento: string;
      selfie?: string;
      assinatura?: string;
      consentimento_lgpd?: boolean;
      declaracao_veracidade?: boolean;
      marca_aparelho?: string;
      geo_lat?: number | null;
      geo_lng?: number | null;
    }
  ) =>
    request<import("./types").EnqueteResultado>(`/enquetes/${id}/votar/`, {
      method: "POST",
      body: JSON.stringify({
        opcao_id: opcaoId,
        device_id: getDeviceId(),
        votante_nome: votante?.nome ?? "",
        votante_bloco: votante?.bloco ?? "",
        votante_apartamento: votante?.apartamento ?? "",
        selfie: votante?.selfie ?? "",
        assinatura: votante?.assinatura ?? "",
        consentimento_lgpd: votante?.consentimento_lgpd ?? false,
        declaracao_veracidade: votante?.declaracao_veracidade ?? false,
        marca_aparelho: votante?.marca_aparelho ?? "",
        geo_lat: votante?.geo_lat ?? null,
        geo_lng: votante?.geo_lng ?? null,
      }),
    }),

  getControleVotacao: (assembleiaId: string) =>
    request<import("./types").ControleVotacao>(
      `/assembleias/${assembleiaId}/controle-votacao/`
    ),

  // Exclusão de cadastro (LGPD)
  solicitarExclusao: (data: {
    nome: string;
    cpf?: string;
    email?: string;
    condominio?: string;
    motivo?: string;
  }) =>
    request<{ message: string }>("/eleitores/exclusao/solicitar/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getSolicitacoesExclusao: () =>
    request<
      import("./types").PaginatedResponse<
        import("./types").SolicitacaoExclusao
      >
    >("/eleitores/solicitacoes-exclusao/"),

  updateSolicitacaoExclusao: (
    id: string,
    data: Partial<{ status: string; observacao_admin: string }>
  ) =>
    request<import("./types").SolicitacaoExclusao>(
      `/eleitores/solicitacoes-exclusao/${id}/`,
      { method: "PATCH", body: JSON.stringify(data) }
    ),

  deleteSolicitacaoExclusao: (id: string) =>
    request<void>(`/eleitores/solicitacoes-exclusao/${id}/`, {
      method: "DELETE",
    }),

  // Listas de presença manual (Votação Simples)
  getListasPresenca: (opts?: { rapido?: boolean }) =>
    request<
      import("./types").PaginatedResponse<import("./types").ListaPresenca>
    >(
      "/enquetes/listas-presenca/" +
        (opts?.rapido === undefined ? "" : `?rapido=${opts.rapido ? 1 : 0}`)
    ),

  createListaPresenca: (
    titulo: string,
    nomeCondominio: string,
    linkReuniao?: string,
    extras?: { descricao?: string; modo_rapido?: boolean }
  ) =>
    request<import("./types").ListaPresenca>("/enquetes/listas-presenca/", {
      method: "POST",
      body: JSON.stringify({
        titulo,
        nome_condominio: nomeCondominio,
        link_reuniao: linkReuniao || "",
        descricao: extras?.descricao || "",
        modo_rapido: !!extras?.modo_rapido,
      }),
    }),

  // Um clique: importa a planilha e cria condomínio + moradores + lista de
  // presença + votação (rascunho) já vinculados.
  importarPlanilhaCompleta: (
    nomeCondominio: string,
    titulo: string,
    eleitores: {
      nome: string;
      cpf_hash: string;
      bloco: string;
      apartamento: string;
      email: string;
    }[],
    inadimplentes: { bloco: string; apartamento: string }[] = []
  ) =>
    request<{
      condominio_id: string;
      lista_id: string;
      lista_codigo: string | null;
      assembleia_id: string;
      assembleia_codigo: string | null;
      criados: number;
      pulados: number;
      inadimplentes_marcados: number;
      erros: { linha: number; erros: Record<string, unknown> }[];
    }>("/enquetes/listas-presenca/importar-planilha/", {
      method: "POST",
      body: JSON.stringify({
        nome_condominio: nomeCondominio,
        titulo,
        eleitores,
        inadimplentes,
      }),
    }),

  getListaPresenca: (id: string) =>
    request<import("./types").ListaPresenca>(
      `/enquetes/listas-presenca/${id}/`
    ),

  updateListaPresenca: (
    id: string,
    data: Partial<{
      titulo: string;
      descricao: string;
      link_reuniao: string;
      ativa: boolean;
    }>
  ) =>
    request<import("./types").ListaPresenca>(
      `/enquetes/listas-presenca/${id}/`,
      { method: "PATCH", body: JSON.stringify(data) }
    ),

  deleteListaPresenca: (id: string) =>
    request<void>(`/enquetes/listas-presenca/${id}/`, { method: "DELETE" }),

  getRegistrosPresenca: (id: string) =>
    request<import("./types").PresencaManualRegistro[]>(
      `/enquetes/listas-presenca/${id}/registros/`
    ),

  deleteRegistroPresenca: (listaId: string, registroId: string) =>
    request<void>(
      `/enquetes/listas-presenca/${listaId}/registros/${registroId}/`,
      { method: "DELETE" }
    ),

  conferirRegistroPresenca: (listaId: string, registroId: string) =>
    request<import("./types").PresencaManualRegistro>(
      `/enquetes/listas-presenca/${listaId}/registros/${registroId}/conferir/`,
      { method: "POST" }
    ),

  getListaPresencaPublica: (id: string) =>
    request<{
      id: string;
      titulo: string;
      descricao?: string;
      condominio_nome?: string;
      ativa: boolean;
      modo_rapido?: boolean;
      total_registros?: number;
      tem_cpf?: boolean;
      // Avisa que existe sala de vídeo; o endereço só vem depois da presença.
      tem_sala?: boolean;
    }>(`/enquetes/listas-presenca/${id}/publica/`),

  consultarCpfPresenca: (id: string, cpf_hash: string) =>
    request<{
      unidades: {
        nome: string;
        bloco: string;
        apartamento: string;
        perfil: string;
      }[];
      encontrado?: boolean;
      // Se este CPF já tem rosto guardado: define se a etapa da câmera vai
      // CONFIRMAR o rosto (um-contra-um) ou cadastrá-lo pela primeira vez.
      tem_rosto?: boolean;
      // Texto pronto para a tela quando o CPF não está na planilha.
      mensagem?: string;
    }>(`/enquetes/listas-presenca/${id}/consultar-cpf/`, {
      method: "POST",
      body: JSON.stringify({ cpf_hash }),
    }),

  registrarPresencaManual: (
    id: string,
    data: {
      nome: string;
      perfil?: string;
      bloco?: string;
      apartamento?: string;
      email?: string;
      selfie?: string;
      assinatura: string;
      metodo_auth: string;
      assinatura_facial?: string;
      marca_aparelho?: string;
      device_id?: string;
      geo_lat?: number | null;
      geo_lng?: number | null;
      consentimento_lgpd: boolean;
      declaracao_veracidade?: boolean;
    }
  ) =>
    request<{
      ok: boolean;
      inadimplente?: boolean;
      aviso?: string;
      link_reuniao?: string;
    }>(
      `/enquetes/listas-presenca/${id}/registrar/`,
      { method: "POST", body: JSON.stringify(data) }
    ),

  reconhecerPresencaFacial: (id: string, descriptor: number[]) =>
    request<{ encontrado: boolean }>(
      `/enquetes/listas-presenca/${id}/facial/reconhecer/`,
    {
      method: "POST",
      body: JSON.stringify({ descriptor }),
    }),

  registrarPresencaFacial: (
    id: string,
    data: {
      // O rosto virou opcional: quando a câmera não lê, a presença entra pela
      // foto e a mesa confere. Quem diz o nome é o cpf_hash.
      descriptor?: number[];
      // Várias leituras do mesmo rosto (nunca a média delas).
      descriptors?: number[][];
      cpf_hash?: string;
      nome?: string;
      bloco?: string;
      apartamento?: string;
      perfil?: string;
      selfie?: string;
      assinatura?: string;
      marca_aparelho?: string;
      consentimento_lgpd: boolean;
      declaracao_veracidade?: boolean;
    }
  ) =>
    request<{
      ok: boolean;
      ja_presente: boolean;
      novo: boolean;
      nome: string;
      bloco?: string;
      apartamento?: string;
      inadimplente?: boolean;
      aviso?: string;
      // Registro que entrou, mas com selo para a mesa olhar (unidade corrigida,
      // rosto não conferido, CPF fora da planilha).
      conferir_na_mesa?: boolean;
      motivo_conferencia?: string;
      aviso_conferencia?: string;
      link_reuniao?: string;
    }>(
      `/enquetes/listas-presenca/${id}/facial/registrar/`,
      { method: "POST", body: JSON.stringify(data) }
    ),

  presencaEnviarCodigo: (id: string, email: string) =>
    request<{ sent: boolean; email_masked: string }>(
      `/enquetes/listas-presenca/${id}/enviar-codigo/`,
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  presencaVerificarCodigo: (id: string, email: string, codigo: string) =>
    request<{ ok: boolean }>(
      `/enquetes/listas-presenca/${id}/verificar-codigo/`,
      { method: "POST", body: JSON.stringify({ email, codigo }) }
    ),

  // Acesso do morador (login + senha)
  eleitorLogin: (login: string, senha: string) =>
    request<EleitorSession>("/eleitor/login/", {
      method: "POST",
      body: JSON.stringify({ login, senha }),
    }),

  eleitorCondominioInfo: (cnpj: string) =>
    request<{ nome: string; blocos: string[] }>(
      `/eleitor/condominio-info/?cnpj=${encodeURIComponent(cnpj)}`
    ),

  eleitorCadastro: (data: {
    cnpj: string;
    nome: string;
    bloco: string;
    apartamento: string;
    senha: string;
  }) =>
    request<EleitorSession>("/eleitor/cadastro/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  eleitorTrocarSenha: (session_token: string, nova_senha: string) =>
    request<EleitorSession>("/eleitor/trocar-senha/", {
      method: "POST",
      body: JSON.stringify({ session_token, nova_senha }),
    }),

  eleitorCadastrarBiometria: (session_token: string, biometria_hash: string) =>
    request<EleitorSession>("/eleitor/biometria/", {
      method: "POST",
      body: JSON.stringify({ session_token, biometria_hash }),
    }),

  eleitorPresenca: (session_token: string) =>
    request<EleitorPresencaResponse>("/eleitor/presenca/", {
      method: "POST",
      body: JSON.stringify({ session_token }),
    }),

  // Master
  masterDashboard: () =>
    request<MasterDashboard>("/auth/master/dashboard/"),

  masterUsers: () =>
    request<MasterUser[]>("/auth/master/users/"),

  masterUpdateUser: (userId: number, data: Partial<MasterUser>) =>
    request<MasterUser>(`/auth/master/users/${userId}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  masterDeleteUser: (userId: number) =>
    request<void>(`/auth/master/users/${userId}/`, {
      method: "DELETE",
    }),

  masterCondominios: () =>
    request<Condominio[]>("/auth/master/condominios/"),

  masterUpdateCondominio: (id: string, data: Partial<Condominio>) =>
    request<Condominio>(`/auth/master/condominios/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  masterDeleteCondominio: (id: string) =>
    request<void>(`/auth/master/condominios/${id}/`, {
      method: "DELETE",
    }),
};

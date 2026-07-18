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
    request<{ criados: number; erros: { linha: number; erros: Record<string, string[]> }[] }>(
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

  resolverCodigo: (codigo: string) =>
    request<{ assembleia_id: string }>(`/assembleias/resolver/${codigo}/`),

  resolverCodigoEnquete: (codigo: string) =>
    request<{ enquete_id: string }>(`/enquetes/resolver/${codigo}/`),

  resolverCodigoLista: (codigo: string) =>
    request<{ lista_id: string }>(
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

  marcarPresenca: (
    assembleiaId: string,
    data: { eleitor_id: string } | { nome: string; apartamento: string; bloco?: string }
  ) =>
    request<Presenca>(`/assembleias/${assembleiaId}/marcar-presenca/`, {
      method: "POST",
      body: JSON.stringify(data),
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
  registrarPresenca: (assembleiaId: string, authToken: string) =>
    request<{ registrado: boolean; novo: boolean; horario_entrada: string }>(
      `/votos/${assembleiaId}/presenca/`,
      { method: "POST", body: JSON.stringify({ auth_token: authToken }) }
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
      token: string;
    }>(`/votos/${assembleiaId}/acesso-manual/`, {
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
    acao: "aprovar" | "rejeitar"
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
    opts?: { voto_aberto?: boolean; condominio?: string }
  ) =>
    request<import("./types").Enquete>("/enquetes/", {
      method: "POST",
      body: JSON.stringify({
        titulo,
        opcoes_texto,
        voto_aberto: opts?.voto_aberto ?? false,
        condominio: opts?.condominio ?? null,
      }),
    }),

  updateEnquete: (
    id: string,
    data: Partial<{ titulo: string; ativa: boolean; voto_aberto: boolean; opcoes_texto: string[] }>
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
    votante?: { nome: string; bloco?: string; apartamento: string }
  ) =>
    request<import("./types").EnqueteResultado>(`/enquetes/${id}/votar/`, {
      method: "POST",
      body: JSON.stringify({
        opcao_id: opcaoId,
        device_id: getDeviceId(),
        votante_nome: votante?.nome ?? "",
        votante_bloco: votante?.bloco ?? "",
        votante_apartamento: votante?.apartamento ?? "",
      }),
    }),

  getControleVotacao: (assembleiaId: string) =>
    request<import("./types").ControleVotacao>(
      `/assembleias/${assembleiaId}/controle-votacao/`
    ),

  // Listas de presença manual (Votação Simples)
  getListasPresenca: () =>
    request<
      import("./types").PaginatedResponse<import("./types").ListaPresenca>
    >("/enquetes/listas-presenca/"),

  createListaPresenca: (titulo: string, condominio?: string | null) =>
    request<import("./types").ListaPresenca>("/enquetes/listas-presenca/", {
      method: "POST",
      body: JSON.stringify({ titulo, condominio: condominio ?? null }),
    }),

  getListaPresenca: (id: string) =>
    request<import("./types").ListaPresenca>(
      `/enquetes/listas-presenca/${id}/`
    ),

  updateListaPresenca: (
    id: string,
    data: Partial<{ titulo: string; descricao: string; ativa: boolean }>
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

  getListaPresencaPublica: (id: string) =>
    request<{ id: string; titulo: string; ativa: boolean }>(
      `/enquetes/listas-presenca/${id}/publica/`
    ),

  registrarPresencaManual: (
    id: string,
    data: {
      nome: string;
      bloco?: string;
      apartamento?: string;
      selfie?: string;
      assinatura: string;
    }
  ) =>
    request<{ ok: boolean }>(
      `/enquetes/listas-presenca/${id}/registrar/`,
      { method: "POST", body: JSON.stringify(data) }
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

import type {
  Assembleia,
  AssembleiaListItem,
  Condominio,
  Eleitor,
  MasterDashboard,
  MasterUser,
  PaginatedResponse,
  Questao,
  Resultado,
  RelatorioVotoResponse,
  User,
  VotoPayload,
  VotoResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

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

  if (res.status === 401) {
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

  createCondominio: (data: Partial<Condominio>) =>
    request<Condominio>("/condominios/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Eleitores
  getEleitores: () =>
    request<PaginatedResponse<Eleitor>>("/eleitores/"),

  createEleitor: (data: Partial<Eleitor>) =>
    request<Eleitor>("/eleitores/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

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
    request<Assembleia>(`/assembleias/${id}/`),

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

  encerrarAssembleia: (id: string) =>
    request<Assembleia>(`/assembleias/${id}/encerrar/`, { method: "POST" }),

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
  votar: (assembleiaId: string, data: VotoPayload) =>
    request<VotoResponse>(`/votos/${assembleiaId}/votar/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getResultados: (assembleiaId: string) =>
    request<Resultado[]>(`/votos/${assembleiaId}/resultados/`),

  getRelatorioVotos: (assembleiaId: string) =>
    request<RelatorioVotoResponse>(`/votos/${assembleiaId}/relatorio/`),

  verificarVoto: (hash: string) =>
    request<{
      encontrado: boolean;
      timestamp?: string;
      assembleia?: string;
      questao?: string;
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
    request<{ authenticated: boolean; method: string; eleitor_id: string; token: string }>(
      "/webauthn/auth/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, credential }),
      }
    ),

  // Biometria Facial
  facialAuthVerify: (eleitorId: string, assembleiaId: string, hash: string) =>
    request<{ authenticated: boolean; method: string; eleitor_id: string; token: string }>(
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
    request<{ authenticated: boolean; method: string; eleitor_id: string; token: string }>(
      "/otp/verify/",
      {
        method: "POST",
        body: JSON.stringify({ eleitor_id: eleitorId, assembleia_id: assembleiaId, code }),
      }
    ),

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

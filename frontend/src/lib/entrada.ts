// Link da votação que abre direto na identificação com selfie (sem a câmera da
// biometria). "direta" é o valor novo, que não revela ao morador que existem
// outros jeitos de entrar; "manual" continua valendo para links já enviados.
export const ENTRADA_DIRETA = ["direta", "manual"];

export function entradaDireta(busca: string) {
  return ENTRADA_DIRETA.includes(new URLSearchParams(busca).get("entrada") || "");
}

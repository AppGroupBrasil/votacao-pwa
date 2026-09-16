// CPF (ou CNPJ da construtora) digitado na lista de presença. O número nunca
// sai do aparelho: vai o hash, para cruzar registros, e a máscara
// (***.456.789-**), que é o que a mesa confere com o documento.

export function soDigitos(valor: string) {
  return (valor || "").replace(/\D/g, "");
}

function digitoVerificador(base: string, pesos: number[]) {
  const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cpfValido(d: string) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

function cnpjValido(d: string) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Os dígitos verificadores pegam a troca de um número na digitação. */
export function documentoValido(valor: string) {
  const d = soDigitos(valor);
  return d.length === 14 ? cnpjValido(d) : cpfValido(d);
}

/** Só o meio do número fica visível: ***.456.789-** ou **.345.678/0001-**. */
export function mascararDocumento(valor: string) {
  const d = soDigitos(valor);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14)
    return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return "";
}

export async function hashDocumento(valor: string) {
  const bytes = new TextEncoder().encode(soDigitos(valor));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

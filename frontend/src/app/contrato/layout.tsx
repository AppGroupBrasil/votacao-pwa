import type { Metadata } from "next";

// Página do navegador ("use client"): o título e a descrição ficam aqui.
export const metadata: Metadata = {
  title: "Contrato de prestação de serviços",
  description:
    "Contrato do App Votação para administradoras e condomínios: planos, prazo, obrigações das partes e tratamento de dados conforme a LGPD.",
  alternates: { canonical: "/contrato" },
};

export default function ContratoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

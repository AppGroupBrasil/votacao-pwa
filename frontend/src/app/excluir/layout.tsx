import type { Metadata } from "next";

// Página do navegador ("use client"): o título e a descrição ficam aqui.
export const metadata: Metadata = {
  title: "Excluir meu cadastro",
  description:
    "Peça a exclusão do seu cadastro e dos seus dados (foto, assinatura e votos) no App Votação, conforme a LGPD.",
  alternates: { canonical: "/excluir" },
};

export default function ExcluirLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

// A página é do navegador ("use client") e não pode declarar o título; este
// layout só embrulha o conteúdo para dar título, descrição e endereço oficial
// ao Google. Não desenha nada.
export const metadata: Metadata = {
  title: "Passo a passo da assembleia online",
  description:
    "Como participar da assembleia do seu condomínio pelo celular: entrar pelo link, confirmar a identidade, registrar presença e votar.",
  alternates: { canonical: "/passo-a-passo" },
};

export default function PassoAPassoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

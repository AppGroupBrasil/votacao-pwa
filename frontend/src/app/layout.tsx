import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner";

const seoTitle = "App Votação — Votação Online para Assembleia de Condomínio com Biometria Facial";
const seoDescription =
  "Votação online para assembleias de condomínio: o morador vota pelo celular com biometria facial ou WebAuthn, resultados em tempo real, lista de presença, gravação da assembleia e resumo e ata com IA.";
const ogImage = { url: "/feature-graphic-1024x500.png", width: 1024, height: 500, alt: "App Votação — votação online para assembleia de condomínio" };

export const metadata: Metadata = {
  metadataBase: new URL("https://appvotacao.com.br"),
  title: seoTitle,
  description: seoDescription,
  keywords: [
    "votação online condomínio",
    "assembleia virtual condomínio",
    "assembleia digital",
    "votação com biometria facial",
    "app de votação",
    "assembleia online",
    "ata de assembleia com IA",
    "lista de presença assembleia",
  ],
  authors: [{ name: "App Group Brasil", url: "https://appgroupbrasil.com.br/" }],
  applicationName: "App Votação",
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "App Votação",
    locale: "pt_BR",
    title: "App Votação — Assembleia de condomínio com votação online segura",
    description:
      "O morador vota pelo celular com biometria facial, o resultado sai na hora e a ata é gerada com IA. Sem limite de votantes.",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "App Votação — Assembleia de condomínio com votação online segura",
    description: "Votação online com biometria facial, resultados em tempo real e ata com IA para assembleias de condomínio.",
    images: [ogImage.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        {children}
        <CookieBanner />
        <script src="https://appgroupbrasil.com.br/embed/app-group-banner.js" data-color="#10b981" data-routes="/" defer></script>
      </body>
    </html>
  );
}

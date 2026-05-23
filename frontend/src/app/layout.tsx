import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner";

export const metadata: Metadata = {
  title: "Votação Online — Assembleia Digital",
  description:
    "Sistema de votação online com biometria facial e WebAuthn para assembleias de condomínio.",
  manifest: "/manifest.json",
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

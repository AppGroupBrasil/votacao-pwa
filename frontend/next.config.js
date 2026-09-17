const defaultRuntimeCaching = require("next-pwa/cache");

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\/.*$/i,
      handler: "NetworkOnly",
      method: "GET",
    },
    ...defaultRuntimeCaching,
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    // Telas de uso (painel, link de votação, lista de presença, cadastro) não
    // são resultado de busca: o cabeçalho tira do índice do Google mesmo o que
    // ele já tenha achado por um link compartilhado. A vitrine
    // (/, /passo-a-passo, documentos) fica de fora desta lista.
    const semIndice = [
      "/admin/:path*",
      "/login",
      "/acesso",
      "/painel",
      "/sso",
      "/assembleia",
      "/votacao/:path*",
      "/resultado/:path*",
      "/r/:path*",
      "/presenca/:path*",
      "/presenca-manual/:path*",
      "/vote/:path*",
      "/v/:path*",
      "/enquete/:path*",
      "/cadastro/:path*",
      "/autocadastro/:path*",
      "/cadastro-facial/:path*",
      "/diagnostico-facial",
      "/recuperar-senha",
      "/redefinir-senha/:path*",
    ].map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));

    // Os modelos do reconhecimento facial (~6 MB) nunca mudam: o aparelho baixa
    // uma vez e reusa nas próximas assembleias.
    return [
      ...semIndice,
      {
        source: "/models/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/v/1", destination: "/acesso", permanent: false },
      { source: "/votar", destination: "/acesso", permanent: false },
    ];
  },
  async rewrites() {
    // As fotos/anexos das questões (media) ficam no backend. Quando o request
    // de /media/* chega ao frontend, encaminhamos para o container do backend
    // na rede interna do Docker (só resolve em produção; em dev o Django serve
    // direto e este rewrite não é acionado).
    return [
      {
        source: "/media/:path*",
        destination: "http://votacao-backend:8000/media/:path*",
      },
    ];
  },
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

module.exports = withPWA(nextConfig);

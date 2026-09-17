import type { MetadataRoute } from "next";

// O que o Google pode varrer. Fora da vitrine (a página inicial, o passo a
// passo e os documentos), tudo é tela de uso: painel do síndico, link de
// votação, lista de presença, cadastro. São páginas sem valor de busca, com
// conteúdo de morador, e os links circulam no WhatsApp — não devem virar
// resultado de pesquisa. O cabeçalho X-Robots-Tag em next.config.js cobre as
// que o Google já tenha visto por um link.
const privadas = [
  "/admin/",
  "/login",
  "/acesso",
  "/painel",
  "/sso",
  "/assembleia",
  "/votacao/",
  "/resultado/",
  "/r/",
  "/presenca/",
  "/presenca-manual/",
  "/vote/",
  "/v/",
  "/enquete/",
  "/cadastro/",
  "/autocadastro/",
  "/cadastro-facial/",
  "/diagnostico-facial",
  "/recuperar-senha",
  "/redefinir-senha/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: privadas },
    sitemap: "https://appvotacao.com.br/sitemap.xml",
    host: "https://appvotacao.com.br",
  };
}

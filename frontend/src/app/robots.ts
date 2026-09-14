import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://appvotacao.com.br/sitemap.xml",
    host: "https://appvotacao.com.br",
  };
}

import type { MetadataRoute } from "next";

const site = "https://appvotacao.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();
  return [
    { url: `${site}/`, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    { url: `${site}/passo-a-passo`, lastModified: agora, changeFrequency: "monthly", priority: 0.7 },
    { url: `${site}/privacidade`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
    { url: `${site}/termos`, lastModified: agora, changeFrequency: "yearly", priority: 0.3 },
  ];
}

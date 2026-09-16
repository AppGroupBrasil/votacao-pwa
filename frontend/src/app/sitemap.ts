import type { MetadataRoute } from "next";

const site = "https://appvotacao.com.br";

// Só as páginas de vitrine e os documentos públicos. A data é fixa e muda à
// mão quando a página muda de verdade: carimbar "hoje" a cada publicação faz o
// Google desconfiar do sitemap inteiro.
const paginas: [caminho: string, atualizada: string, frequencia: "weekly" | "monthly" | "yearly", prioridade: number][] = [
  ["/", "2026-09-16", "weekly", 1],
  ["/passo-a-passo", "2026-09-16", "monthly", 0.7],
  ["/contrato", "2026-09-16", "yearly", 0.4],
  ["/privacidade", "2026-05-08", "yearly", 0.3],
  ["/termos", "2026-05-08", "yearly", 0.3],
  ["/excluir", "2026-09-16", "yearly", 0.3],
  ["/excluir-conta", "2026-09-16", "yearly", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return paginas.map(([caminho, atualizada, changeFrequency, priority]) => ({
    url: `${site}${caminho}`,
    lastModified: new Date(atualizada),
    changeFrequency,
    priority,
  }));
}

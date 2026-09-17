"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";

// appvotacao.com.br/r/<codigo> — o mesmo código curto do link de votação,
// só que abrindo o resultado ao vivo em vez da cédula. Serve para o telão da
// assembleia e para mandar no grupo.
export default function ResultadoCurtoRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    let ativo = true;
    const code = String(params?.code || "");

    (async () => {
      try {
        const r = await api.resolverCodigo(code);
        if (!ativo) return;
        if (r?.assembleia_id) {
          // Código de um item: o resultado abre só naquela questão.
          const busca = r.questao_id ? `?q=${r.questao_id}` : "";
          router.replace(`/resultado/${r.assembleia_id}${busca}`);
          return;
        }
      } catch {
        // código inválido ou de outro tipo (enquete, lista): cai na home
      }
      if (ativo) router.replace("/");
    })();

    return () => {
      ativo = false;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">
      Abrindo o resultado...
    </div>
  );
}

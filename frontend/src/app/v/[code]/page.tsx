"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Códigos curtos fixos por assembleia (atalhos para compartilhar no chat).
const ATALHOS: Record<string, string> = {
  "1": "76526cc0-9f0e-4e70-b15b-88a7b1b82983",
};

function decodeBase62ToUuid(code: string): string | null {
  try {
    let n = BigInt(0);
    const base = BigInt(62);
    for (const ch of code) {
      const idx = ALPHABET.indexOf(ch);
      if (idx < 0) return null;
      n = n * base + BigInt(idx);
    }
    let hex = n.toString(16).padStart(32, "0");
    if (hex.length !== 32) return null;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

export default function ShortVotacaoRedirect() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    let ativo = true;
    const code = String(params?.code || "");

    if (ATALHOS[code]) {
      router.replace(`/votacao/${ATALHOS[code]}`);
      return;
    }

    (async () => {
      // Código curto novo (resolvido no backend).
      try {
        const r = await api.resolverCodigo(code);
        if (ativo && r?.assembleia_id) {
          // Código de um item: abre a votação só daquela questão.
          router.replace(
            r.questao_id
              ? `/votacao/${r.assembleia_id}?q=${r.questao_id}`
              : `/votacao/${r.assembleia_id}`
          );
          return;
        }
      } catch {
        // não é código de assembleia — tenta enquete abaixo
      }
      if (!ativo) return;
      // Código curto de enquete (votação simples).
      try {
        const r = await api.resolverCodigoEnquete(code);
        if (ativo && r?.enquete_id) {
          router.replace(`/enquete/${r.enquete_id}`);
          return;
        }
      } catch {
        // não é código de enquete — tenta lista de presença abaixo
      }
      if (!ativo) return;
      // Código curto de lista de presença manual.
      try {
        const r = await api.resolverCodigoLista(code);
        if (ativo && r?.lista_id) {
          // Lista rápida vai para a tela sem biometria: só foto e assinatura.
          router.replace(
            r.modo_rapido
              ? `/presenca/${r.lista_id}`
              : `/presenca-manual/${r.lista_id}`
          );
          return;
        }
      } catch {
        // não é código curto — tenta os formatos antigos abaixo
      }
      if (!ativo) return;
      // Compatibilidade com links base62 antigos (UUID codificado, ~22 chars).
      const uuid = code.length >= 20 ? decodeBase62ToUuid(code) : null;
      router.replace(uuid ? `/votacao/${uuid}` : "/");
    })();

    return () => {
      ativo = false;
    };
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Abrindo votação...
    </div>
  );
}

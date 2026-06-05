"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

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
    const code = String(params?.code || "");
    const uuid = ATALHOS[code] || decodeBase62ToUuid(code);
    router.replace(uuid ? `/votacao/${uuid}` : "/");
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Abrindo votação...
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResultadosRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/assembleias?tab=resultados");
  }, [router]);
  return null;
}

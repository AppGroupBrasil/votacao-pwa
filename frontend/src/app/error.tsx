"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Algo deu errado</h1>
        <p className="text-gray-600 mb-6">
          Ocorreu um erro inesperado. Tente novamente em instantes.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

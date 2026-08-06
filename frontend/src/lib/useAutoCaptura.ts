"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Captura automática: acompanha o rosto na imagem da câmera e dispara a foto
 * sozinho quando o enquadramento fica bom por algumas leituras seguidas.
 * O botão manual continua valendo como saída se a detecção não pegar.
 */

export type DicaAuto =
  | ""
  | "procurando"
  | "aproxime"
  | "centralize"
  | "segure"
  | "pronto";

const INTERVALO_MS = 400;
// Três leituras boas seguidas (~1,2s): evita disparar num rosto que só passou
// na frente da câmera ou numa imagem ainda tremendo.
const LEITURAS_BOAS = 3;
const LARGURA_MINIMA = 0.2;
const DESVIO_MAXIMO = 0.24;

export function textoDica(dica: DicaAuto): string {
  switch (dica) {
    case "aproxime":
      return "Aproxime um pouco o rosto da câmera.";
    case "centralize":
      return "Centralize o rosto na moldura.";
    case "segure":
      return "Quase lá — fique parado.";
    case "pronto":
      return "Capturando...";
    case "procurando":
      return "Encaixe o rosto na moldura. A foto sai sozinha.";
    default:
      return "";
  }
}

export function useAutoCaptura({
  video,
  ativo,
  onCapturar,
}: {
  video: { current: HTMLVideoElement | null };
  ativo: boolean;
  onCapturar: () => void;
}): DicaAuto {
  const [dica, setDica] = useState<DicaAuto>("");
  const onCapturarRef = useRef(onCapturar);
  onCapturarRef.current = onCapturar;

  useEffect(() => {
    if (!ativo) {
      setDica("");
      return;
    }

    let vivo = true;
    let boas = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setDica("procurando");

    async function ciclo() {
      if (!vivo) return;
      const el = video.current;
      try {
        if (el && el.videoWidth) {
          const { loadModels, detectarCaixaRosto } = await import("@/lib/faceapi");
          await loadModels();
          if (!vivo) return;
          const caixa = await detectarCaixaRosto(el);
          if (!vivo) return;

          if (!caixa) {
            boas = 0;
            setDica("procurando");
          } else {
            const largura = caixa.largura / el.videoWidth;
            const desvioX =
              Math.abs(caixa.x + caixa.largura / 2 - el.videoWidth / 2) /
              el.videoWidth;
            const desvioY =
              Math.abs(caixa.y + caixa.altura / 2 - el.videoHeight / 2) /
              el.videoHeight;

            if (largura < LARGURA_MINIMA) {
              boas = 0;
              setDica("aproxime");
            } else if (desvioX > DESVIO_MAXIMO || desvioY > DESVIO_MAXIMO) {
              boas = 0;
              setDica("centralize");
            } else {
              boas += 1;
              if (boas >= LEITURAS_BOAS) {
                vivo = false;
                setDica("pronto");
                onCapturarRef.current();
                return;
              }
              setDica("segure");
            }
          }
        }
      } catch {
        // Modelo ainda baixando, aba em segundo plano, navegador sem suporte:
        // segue tentando; o botão manual continua disponível na tela.
      }
      if (vivo) timer = setTimeout(ciclo, INTERVALO_MS);
    }

    ciclo();

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [ativo, video]);

  return dica;
}

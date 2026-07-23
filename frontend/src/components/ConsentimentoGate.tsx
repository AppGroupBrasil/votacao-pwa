"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Eraser } from "lucide-react";
import type { CapturaIdentidade } from "@/lib/types";

interface ConsentimentoGateProps {
  onConcluir: (captura: CapturaIdentidade) => void;
}

async function detectarMarca(): Promise<string> {
  const uaData = (navigator as any).userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const hi = await uaData.getHighEntropyValues(["model", "platform", "platformVersion"]);
      const partes = [hi.model, hi.platform].filter(Boolean);
      if (partes.length) return partes.join(" ").slice(0, 120);
    } catch {
      /* segue para o fallback */
    }
  }
  return (navigator.userAgent || "").slice(0, 120);
}

// Tela inicial do voto: consentimento LGPD (resumido/discreto), declaração de
// veracidade e assinatura desenhada. Geolocalização e marca do aparelho são
// captadas em silêncio. Nada disso bloqueia o voto além do aceite explícito.
export default function ConsentimentoGate({ onConcluir }: ConsentimentoGateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const assinou = useRef(false);
  const [temAssinatura, setTemAssinatura] = useState(false);
  const [consentLgpd, setConsentLgpd] = useState(false);
  const [veracidade, setVeracidade] = useState(false);

  const geo = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const marca = useRef("");

  useEffect(() => {
    detectarMarca().then((m) => { marca.current = m; });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { geo.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => { /* sem permissão de GPS: segue sem coordenadas */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  function iniciar(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!assinou.current) { assinou.current = true; setTemAssinatura(true); }
  }

  function parar() {
    desenhando.current = false;
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    assinou.current = false;
    setTemAssinatura(false);
  }

  function continuar() {
    const canvas = canvasRef.current;
    const assinatura = canvas ? canvas.toDataURL("image/png") : "";
    onConcluir({
      consentimento_lgpd: true,
      declaracao_veracidade: true,
      assinatura,
      marca_aparelho: marca.current,
      geo_lat: geo.current.lat,
      geo_lng: geo.current.lng,
      modo_participacao: "online",
    });
  }

  const pronto = consentLgpd && veracidade && temAssinatura;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 justify-center">
        <ShieldCheck className="w-6 h-6 text-primary-600" />
        <h3 className="font-semibold">Antes de votar</h3>
      </div>

      <div>
        <p className="text-sm font-medium mb-1">Sua assinatura</p>
        <div className="relative border border-gray-300 rounded-lg bg-white">
          <canvas
            ref={canvasRef}
            width={560}
            height={160}
            className="w-full h-40 touch-none rounded-lg"
            onPointerDown={iniciar}
            onPointerMove={mover}
            onPointerUp={parar}
            onPointerLeave={parar}
          />
          {!temAssinatura && (
            <span className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
              Assine com o dedo ou o mouse
            </span>
          )}
          <button
            type="button"
            onClick={limpar}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            aria-label="Limpar assinatura"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
        <input
          type="checkbox"
          checked={consentLgpd}
          onChange={(e) => setConsentLgpd(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Autorizo, conforme a LGPD, o registro da minha identificação (selfie,
          assinatura, IP, localização e aparelho) apenas para validar e auditar
          este voto.
        </span>
      </label>

      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={veracidade}
          onChange={(e) => setVeracidade(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Declaro que as informações são verdadeiras. Se for constatado que
          qualquer informação não corresponde a fatos verdadeiros, o meu voto
          será automaticamente anulado.
        </span>
      </label>

      <button
        onClick={continuar}
        disabled={!pronto}
        className="btn-primary w-full disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );
}

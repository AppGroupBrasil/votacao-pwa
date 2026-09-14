"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Vote, Camera, Fingerprint, CheckCircle, Mail } from "lucide-react";
import { api } from "@/lib/api";
import WebAuthnEnroll from "@/components/webauthn/WebAuthnEnroll";

// Só no navegador (como no /acesso): o TensorFlow do reconhecimento quebra
// quando o servidor monta a página, e o convite respondia erro 500.
const FaceCapture = dynamic(() => import("@/components/FaceCapture"), { ssr: false });

type Step = "loading" | "welcome" | "selfie" | "webauthn" | "done";

export default function CadastroPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [step, setStep] = useState<Step>("loading");
  const [eleitor, setEleitor] = useState<{
    id: string;
    nome: string;
    apartamento: string;
    cadastro_completo: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [biometriaHash, setBiometriaHash] = useState("");
  const [showFaceFallback, setShowFaceFallback] = useState(false);
  const [showWebauthnFallback, setShowWebauthnFallback] = useState(false);

  useEffect(() => {
    async function validateToken() {
      try {
        const data = await api.validarConvite(token);
        setEleitor(data);
        if (data.cadastro_completo) {
          setStep("done");
        } else {
          setStep("welcome");
        }
      } catch {
        setError("Link de convite inválido ou expirado.");
      }
    }
    validateToken();
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card text-center max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Vote className="w-7 h-7 text-primary-600" />
          <span className="font-bold text-lg">Votação Online</span>
        </div>

        {step === "loading" && (
          <p className="text-center text-gray-500">Verificando convite...</p>
        )}

        {step === "welcome" && eleitor && (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">Bem-vindo, {eleitor.nome}!</h1>
            <p className="text-gray-600">
              Apartamento {eleitor.apartamento}
            </p>
            <p className="text-sm text-gray-500">
              Vamos configurar sua autenticação para que você possa
              votar com segurança.
            </p>
            <button
              onClick={() => setStep("selfie")}
              className="btn-primary w-full mt-4"
            >
              Iniciar Cadastro
            </button>
          </div>
        )}

        {step === "selfie" && eleitor && (
          <SelfieStep
            eleitor={eleitor}
            showFallback={showFaceFallback}
            onShowFallback={() => setShowFaceFallback(true)}
            onCapture={(hash) => {
              setBiometriaHash(hash);
              setStep("webauthn");
            }}
            onSkipToWebauthn={() => setStep("webauthn")}
            onSkipToOtp={async () => {
              try {
                await api.onboarding(token, {
                  biometria_hash: "otp-only",
                });
                setStep("done");
              } catch {
                setError("Erro ao completar cadastro.");
              }
            }}
          />
        )}

        {step === "webauthn" && eleitor && (
          <WebauthnStep
            eleitor={eleitor}
            showFallback={showWebauthnFallback}
            onShowFallback={() => setShowWebauthnFallback(true)}
            onSuccess={async () => {
              try {
                await api.onboarding(token, {
                  biometria_hash: biometriaHash || "no-face-capture",
                });
                setStep("done");
              } catch {
                setError("Erro ao completar cadastro.");
              }
            }}
            onSkipToOtp={async () => {
              try {
                await api.onboarding(token, {
                  biometria_hash: biometriaHash || "no-face-capture",
                });
                setStep("done");
              } catch {
                setError("Erro ao completar cadastro.");
              }
            }}
          />
        )}

        {step === "done" && (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold">Cadastro Completo!</h2>
            <p className="text-gray-600">
              Você está pronto para votar nas assembleias do seu condomínio.
            </p>
            <p className="text-sm text-gray-500">
              Quando uma votação for aberta, você receberá um link de acesso.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-componente: Selfie com fallback discreto após 15s ─── */
function SelfieStep({
  eleitor,
  showFallback,
  onShowFallback,
  onCapture,
  onSkipToWebauthn,
  onSkipToOtp,
}: {
  eleitor: { id: string };
  showFallback: boolean;
  onShowFallback: () => void;
  onCapture: (hash: string) => void;
  onSkipToWebauthn: () => void;
  onSkipToOtp: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onShowFallback, 15000);
    return () => clearTimeout(timer);
  }, [onShowFallback]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-center">Selfie de Verificação</h2>
      <p className="text-sm text-gray-500 text-center">
        A câmera será aberta para capturar seu rosto. A imagem é
        processada localmente e nunca sai do dispositivo.
      </p>
      <FaceCapture eleitorId={eleitor.id} onCapture={onCapture} />

      {showFallback && (
        <div className="border-t pt-4 mt-4 space-y-2 animate-fadeIn">
          <p className="text-xs text-gray-400 text-center">
            Está com dificuldade? Você pode usar outro método:
          </p>
          <button
            onClick={onSkipToWebauthn}
            className="w-full text-xs text-gray-500 hover:text-primary-600 transition-colors flex items-center justify-center gap-1.5 py-2"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            Usar digital ou PIN no lugar
          </button>
          <button
            onClick={onSkipToOtp}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1.5 py-1"
          >
            <Mail className="w-3.5 h-3.5" />
            Usar apenas código por e-mail
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-componente: WebAuthn com fallback discreto após 15s ─── */
function WebauthnStep({
  eleitor,
  showFallback,
  onShowFallback,
  onSuccess,
  onSkipToOtp,
}: {
  eleitor: { id: string };
  showFallback: boolean;
  onShowFallback: () => void;
  onSuccess: () => void;
  onSkipToOtp: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onShowFallback, 15000);
    return () => clearTimeout(timer);
  }, [onShowFallback]);

  return (
    <div>
      <h2 className="text-xl font-bold text-center mb-4">
        Cadastrar Digital / PIN
      </h2>
      <WebAuthnEnroll
        eleitorId={eleitor.id}
        onSuccess={onSuccess}
        onSkip={onSkipToOtp}
      />

      {showFallback && (
        <div className="border-t pt-4 mt-4 animate-fadeIn">
          <p className="text-xs text-gray-400 text-center mb-2">
            Não consegue cadastrar a digital?
          </p>
          <button
            onClick={onSkipToOtp}
            className="w-full text-xs text-gray-500 hover:text-primary-600 transition-colors flex items-center justify-center gap-1.5 py-2"
          >
            <Mail className="w-3.5 h-3.5" />
            Usar apenas código por e-mail
          </button>
        </div>
      )}
    </div>
  );
}

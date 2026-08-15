"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScanFace,
  Camera,
  Loader2,
  Mail,
  ShieldCheck,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  UserCheck,
  Pencil,
} from "lucide-react";
import { api, getDeviceId } from "@/lib/api";
import { loadModels, lerRosto as lerRostoCamera } from "@/lib/faceapi";
import { useAutoCaptura, textoDica } from "@/lib/useAutoCaptura";

const PERFIS = [
  { v: "proprietario", l: "Proprietário" },
  { v: "locatario", l: "Locatário" },
  { v: "conjuge", l: "Cônjuge" },
  { v: "procurador", l: "Procurador" },
  { v: "outro", l: "Outro" },
];

function textoUnidade(bloco: string, apartamento: string) {
  return [
    bloco?.trim() && `Bloco ${bloco.trim()}`,
    apartamento?.trim() && `Apto ${apartamento.trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.replace(/\D/g, ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Unidade = {
  nome: string;
  bloco: string;
  apartamento: string;
  perfil?: string;
};

/**
 * Entrada da votação: o CPF diz quem é a pessoa, o rosto só CONFIRMA (um contra
 * um). Antes o rosto era procurado no meio de centenas de cadastros e escolhia
 * o nome mais parecido — foi o que trocou nomes na assembleia de 08/08/2026.
 *
 * CPF → "é você, Fulano?" → foto que confirma → vota.
 * Dados errados na planilha, CPF fora da relação ou rosto que não confirma não
 * barram ninguém: entra com selo laranja e a mesa libera o voto depois.
 * Condomínio sem planilha de CPF cai no caminho antigo (busca pelo rosto).
 */
export default function AcessoFacialVotacao({
  assembleiaId,
  temCpf = false,
  onSuccess,
  onEmail,
  onManual,
}: {
  assembleiaId: string;
  temCpf?: boolean;
  onSuccess: (token: string, votanteId: string, avisoUnidade?: string) => void;
  onEmail: () => void;
  onManual: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camAtiva, setCamAtiva] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [selfie, setSelfie] = useState("");
  const [nome, setNome] = useState("");
  const [bloco, setBloco] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [perfil, setPerfil] = useState("proprietario");
  const [lgpd, setLgpd] = useState(false);
  // Falhas seguidas de leitura: depois de duas, a selfie entra no lugar da
  // biometria em vez de deixar o morador preso na câmera.
  const [falhas, setFalhas] = useState(0);

  // --- portão de CPF ---
  const [etapa, setEtapa] = useState<
    "cpf" | "naoconsta" | "confirmar" | "corrigir" | "camera" | "novoRosto"
  >(temCpf ? "cpf" : "camera");
  const [cpf, setCpf] = useState("");
  const [cpfHash, setCpfHash] = useState("");
  const [consultandoCpf, setConsultandoCpf] = useState(false);
  const [erroCpf, setErroCpf] = useState("");
  const [unidadesCpf, setUnidadesCpf] = useState<Unidade[] | null>(null);
  const [mensagemCpf, setMensagemCpf] = useState("");
  const [temRostoCadastrado, setTemRostoCadastrado] = useState(false);
  const [dadosPlanilha, setDadosPlanilha] = useState<Unidade | null>(null);
  const [motivoCorrecao, setMotivoCorrecao] = useState<
    "divergencia" | "sem_cadastro"
  >("divergencia");

  // Tela final: confirma quem entrou (verde) ou avisa que a mesa vai conferir
  // antes de o voto valer (laranja).
  const [resultado, setResultado] = useState<{
    nome: string;
    aviso: string;
    entrar: () => void;
  } | null>(null);

  // Primeira vez deste CPF: a foto de agora vira o cadastro, então precisa do
  // consentimento LGPD antes de ler o rosto.
  const precisaLgpd = !!cpfHash && !temRostoCadastrado;

  useEffect(() => {
    loadModels().catch(() => {});
    return () => pararCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (camAtiva && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [camAtiva]);

  // Leitura automática: basta olhar para a câmera. Assim que o rosto fica bem
  // enquadrado o sistema lê sozinho. Se der erro, a automação para e o morador
  // decide se tenta de novo pelo botão ou entra por outro caminho.
  const dicaAuto = useAutoCaptura({
    video: videoRef,
    ativo:
      camAtiva &&
      etapa === "camera" &&
      !processando &&
      !resultado &&
      !erro &&
      (!precisaLgpd || lgpd),
    onCapturar: () => lerRosto(),
  });

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamAtiva(false);
  }

  async function abrirCamera() {
    setErro("");
    loadModels().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCamAtiva(true);
    } catch {
      setErro(
        "Não foi possível abrir a câmera. Verifique a permissão ou entre pelo e-mail."
      );
    }
  }

  function capturarFrame(video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    const max = 640;
    const escala = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  async function consultarCpf() {
    const digitos = cpf.replace(/\D/g, "");
    if (digitos.length !== 11 && digitos.length !== 14) {
      setErroCpf("Digite os 11 números do seu CPF.");
      return;
    }
    setConsultandoCpf(true);
    setErroCpf("");
    try {
      const hash = await sha256Hex(digitos);
      const res = await api.consultarCpfVotacao(assembleiaId, hash);
      // O hash acompanha o resto do fluxo: é ele que faz o rosto ser apenas
      // CONFIRMADO depois, em vez de procurado no meio de todos os moradores.
      setCpfHash(hash);
      setTemRostoCadastrado(!!res.tem_rosto);
      setUnidadesCpf(res.unidades || []);
      setMensagemCpf(res.mensagem || "");
      if (!res.unidades?.length) {
        setEtapa("naoconsta");
      } else if (res.unidades.length === 1) {
        prepararUnidade(res.unidades[0]);
        setEtapa("confirmar");
      }
    } catch {
      setErroCpf("Não consegui consultar agora. Tente de novo em instantes.");
    } finally {
      setConsultandoCpf(false);
    }
  }

  function prepararUnidade(u: Unidade) {
    setNome(u.nome || "");
    setBloco(u.bloco || "");
    setApartamento(u.apartamento || "");
    setPerfil(u.perfil || "proprietario");
    setDadosPlanilha({
      nome: u.nome || "",
      bloco: u.bloco || "",
      apartamento: u.apartamento || "",
    });
  }

  function irParaCamera() {
    setErro("");
    setEtapa("camera");
    if (!camAtiva) abrirCamera();
  }

  // Resposta do servidor: entrou (verde) ou entrou com selo laranja.
  function aplicarResposta(r: {
    encontrado: boolean;
    token?: string;
    nome?: string;
    votante_manual_id?: string;
    aviso_unidade?: string;
    conferir_na_mesa?: boolean;
    aviso_conferencia?: string;
  }) {
    if (!r.encontrado || !r.token) return false;
    pararCamera();
    const token = r.token;
    const votanteId = r.votante_manual_id || "";
    const avisoUnidade = r.aviso_unidade || "";
    setResultado({
      nome: r.nome || nome,
      aviso: r.conferir_na_mesa ? r.aviso_conferencia || "" : "",
      entrar: () => onSuccess(token, votanteId, avisoUnidade),
    });
    return true;
  }

  function textoErroServidor(e: any, padrao: string) {
    // O motivo costuma vir do servidor ("assembleia não está aberta",
    // "registre a presença primeiro"). Escondê-lo atrás de um texto genérico
    // faz parecer defeito da câmera quando é regra da votação.
    return e?.response?.data?.error || e?.response?.data?.detail || padrao;
  }

  async function lerRosto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErro("Aguarde a imagem da câmera aparecer e tente de novo.");
      return;
    }
    if (precisaLgpd && !lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const canvas = capturarFrame(video);
      if (!canvas) return;
      const selfieData = canvas.toDataURL("image/jpeg", 0.7);
      setSelfie(selfieData);
      await loadModels();
      // Várias leituras do rosto ao vivo, guardadas SEPARADAS — a média que
      // ficava aqui aproximava rostos diferentes e ajudou a trocar nomes na
      // assembleia de 08/08/2026. Se a imagem ao vivo não render o rosto, tenta
      // na foto parada, que é a mesma usada como selfie.
      const leitura = await lerRostoCamera([video, canvas]);
      if (!leitura || !leitura.boa) {
        setFalhas((n) => n + 1);
        setErro(
          !leitura
            ? "Não reconheci um rosto. Aproxime-se, melhore a luz e tente de novo."
            : "A imagem ficou escura ou o rosto ficou pequeno na tela. Chegue mais perto, procure um lugar mais claro e tente de novo."
        );
        return;
      }
      const todas = leitura.leituras.map((l) => Array.from(l.descriptor));
      const arr = todas[0];
      setDescriptor(arr);
      const r = await api.acessoFacialVotacao(assembleiaId, {
        descriptor: arr,
        descriptors: todas,
        device_id: getDeviceId(),
        // A foto vai sempre, com CPF ou sem. Quem entra sem o CPF não passou
        // por nenhuma conferência: a foto de agora é a única prova de quem
        // estava na porta para a mesa comparar com o documento.
        selfie: selfieData,
        ...(cpfHash
          ? {
              cpf_hash: cpfHash,
              nome: nome.trim(),
              bloco: bloco.trim(),
              apartamento: apartamento.trim(),
              perfil,
              consentimento_lgpd: true,
            }
          : {}),
      });
      if (aplicarResposta(r)) return;
      // Rosto novo em condomínio sem planilha: pede nome/unidade uma única vez.
      pararCamera();
      setEtapa("novoRosto");
    } catch (e: any) {
      setErro(
        textoErroServidor(
          e,
          "Não foi possível processar o rosto. Tente de novo ou use o e-mail."
        )
      );
    } finally {
      setProcessando(false);
    }
  }

  // A selfie no lugar da biometria: contraluz do salão, óculos, tremor. Entra
  // do mesmo jeito, com selo laranja para a mesa conferir o documento.
  async function entrarComSelfie() {
    const video = videoRef.current;
    const canvas = video && video.videoWidth ? capturarFrame(video) : null;
    const selfieData = canvas ? canvas.toDataURL("image/jpeg", 0.7) : selfie;
    if (!selfieData) {
      setErro("Abra a câmera para tirar a foto antes de continuar.");
      return;
    }
    if (precisaLgpd && !lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const r = await api.acessoFacialVotacao(assembleiaId, {
        cpf_hash: cpfHash,
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        perfil,
        selfie: selfieData,
        consentimento_lgpd: true,
        device_id: getDeviceId(),
      });
      if (aplicarResposta(r)) return;
      setErro("Não foi possível concluir. Tente novamente.");
    } catch (e: any) {
      setErro(textoErroServidor(e, "Não foi possível concluir. Tente novamente."));
    } finally {
      setProcessando(false);
    }
  }

  async function cadastrarEEntrar() {
    if (!descriptor) return;
    if (!nome.trim() || !apartamento.trim()) {
      setErro("Informe seu nome e apartamento/unidade.");
      return;
    }
    if (!lgpd) {
      setErro("É necessário concordar com o uso dos dados (LGPD).");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const r = await api.acessoFacialVotacao(assembleiaId, {
        descriptor,
        nome: nome.trim(),
        bloco: bloco.trim(),
        apartamento: apartamento.trim(),
        perfil,
        selfie,
        consentimento_lgpd: true,
        device_id: getDeviceId(),
      });
      if (aplicarResposta(r)) return;
      setErro("Não foi possível concluir. Tente novamente.");
    } catch (e: any) {
      setErro(textoErroServidor(e, "Não foi possível concluir. Tente novamente."));
    } finally {
      setProcessando(false);
    }
  }

  const nomePerfil = PERFIS.find((p) => p.v === perfil)?.l || "Proprietário";

  // Entrou. Verde quando está tudo certo; laranja quando a mesa precisa
  // conferir antes de o voto valer.
  if (resultado) {
    const laranja = !!resultado.aviso;
    return (
      <div className="text-center">
        <div
          className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${
            laranja ? "bg-amber-100" : "bg-green-100"
          }`}
        >
          {laranja ? (
            <AlertTriangle className="h-11 w-11 text-amber-600" strokeWidth={2.2} />
          ) : (
            <CheckCircle2 className="h-12 w-12 text-green-600" strokeWidth={2.2} />
          )}
        </div>
        <h1
          className={`text-2xl font-extrabold ${
            laranja ? "text-amber-700" : "text-green-700"
          }`}
        >
          {laranja ? "Entrada registrada" : "Identidade confirmada"}
        </h1>
        {resultado.nome && (
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {resultado.nome}
          </p>
        )}
        {textoUnidade(bloco, apartamento) && (
          <p className="text-sm text-gray-600">
            {textoUnidade(bloco, apartamento)}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-xs text-sm text-gray-600">
          {laranja
            ? resultado.aviso
            : cpfHash
            ? "Seu CPF e sua foto conferem. Você já pode votar."
            : "Sua identificação foi confirmada pela biometria facial. Você já pode votar."}
        </p>

        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt="Sua foto"
            className={`mx-auto mt-4 h-24 w-24 rounded-xl border-2 object-cover ${
              laranja ? "border-amber-500" : "border-green-500"
            }`}
          />
        )}

        <button
          onClick={resultado.entrar}
          className="btn-primary mt-6 w-full py-3 text-base"
        >
          Continuar para a votação
        </button>
      </div>
    );
  }

  // "É você, Fulano?" — o passo que faltava. Antes o sistema decidia sozinho
  // quem era a pessoa pelo rosto; agora mostra o que encontrou pelo CPF e
  // espera a confirmação. Se estiver errado, o próprio morador corrige.
  if (etapa === "confirmar") {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <UserCheck className="h-4 w-4 text-primary-600" />
          Confirme se é você
        </div>
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
          <p className="text-lg font-semibold leading-tight text-gray-900">
            {nome || "—"}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {textoUnidade(bloco, apartamento) || "Unidade não informada"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{nomePerfil}</p>
        </div>
        <button onClick={irParaCamera} className="btn-primary mt-4 w-full">
          Sim, sou eu
        </button>
        <button
          onClick={() => {
            setMotivoCorrecao("divergencia");
            setEtapa("corrigir");
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" /> Não sou eu / corrigir meus dados
        </button>
        <p className="mt-4 px-1 text-xs text-gray-500">
          {temRostoCadastrado
            ? "Na próxima tela você tira uma foto. Ela serve só para confirmar que é você mesmo, comparando com a foto do seu próprio cadastro."
            : "Na próxima tela você tira uma foto. Como é a sua primeira vez, ela fica guardada como o seu cadastro para as próximas assembleias."}
        </p>
      </div>
    );
  }

  // CPF que não está na relação da administradora. O morador entra do mesmo
  // jeito; o texto explica de onde vem a falha para ele não achar que é o
  // sistema que está errado.
  if (etapa === "naoconsta") {
    return (
      <div>
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {mensagemCpf ||
              "Seu CPF não consta na planilha de moradores. Verifique junto à administração do seu condomínio ou sua administradora, porque seu nome não consta na relação."}{" "}
            Você pode votar preenchendo os dados abaixo — a mesa confere antes de
            o voto valer.
          </span>
        </div>
        <button
          onClick={() => {
            setMotivoCorrecao("sem_cadastro");
            setEtapa("corrigir");
          }}
          className="btn-primary mt-4 w-full"
        >
          Preencher meus dados e continuar
        </button>
        <button
          onClick={() => {
            setUnidadesCpf(null);
            setMensagemCpf("");
            setCpfHash("");
            setEtapa("cpf");
          }}
          className="mt-3 w-full text-sm text-gray-500 underline underline-offset-2"
        >
          Digitar o CPF de novo
        </button>
      </div>
    );
  }

  // Correção manual: nome, unidade e perfil na mão. É a saída para quando a
  // planilha veio errada ou o CPF não consta. Nada disso barra o morador — ele
  // entra e participa; o voto é que espera a mesa conferir.
  if (etapa === "corrigir") {
    const mudou =
      !!dadosPlanilha &&
      (dadosPlanilha.nome.trim() !== nome.trim() ||
        dadosPlanilha.bloco.trim() !== bloco.trim() ||
        dadosPlanilha.apartamento.trim() !== apartamento.trim());
    return (
      <div>
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {motivoCorrecao === "sem_cadastro" ? (
              mensagemCpf ||
              "Seu CPF não consta na planilha de moradores. Verifique junto à administração do seu condomínio ou sua administradora, porque seu nome não consta na relação."
            ) : (
              <>
                <b>Atenção:</b> os dados que aparecem aqui vêm da planilha de
                moradores enviada pela administração do condomínio. Se estiver
                alguma coisa diferente, a divergência é dessa planilha — corrija
                abaixo e siga normalmente. A mesa da assembleia confere o que foi
                alterado antes de o voto valer.
              </>
            )}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field w-full"
              placeholder="Como está no seu documento"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bloco
              </label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field w-full"
                placeholder="A"
                maxLength={20}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Apartamento
              </label>
              <input
                value={apartamento}
                onChange={(e) => setApartamento(e.target.value)}
                className="input-field w-full"
                placeholder="305"
                maxLength={20}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Você é o que na unidade?
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="input-field w-full"
            >
              {PERFIS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mudou && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-xs text-gray-600">
            Na planilha consta <b>{dadosPlanilha!.nome || "sem nome"}</b> —{" "}
            {textoUnidade(dadosPlanilha!.bloco, dadosPlanilha!.apartamento) ||
              "sem unidade"}
            . Você entra normalmente; o voto da unidade fica sinalizado para a
            mesa conferir.
          </div>
        )}

        <button
          onClick={irParaCamera}
          disabled={!nome.trim() || !apartamento.trim()}
          className="btn-primary mt-4 w-full disabled:opacity-50"
        >
          Continuar
        </button>
        {dadosPlanilha && (
          <button
            onClick={() => {
              setNome(dadosPlanilha.nome);
              setBloco(dadosPlanilha.bloco);
              setApartamento(dadosPlanilha.apartamento);
              setEtapa("confirmar");
            }}
            className="mt-3 w-full text-sm text-gray-500 underline underline-offset-2"
          >
            Voltar sem alterar
          </button>
        )}
      </div>
    );
  }

  // Rosto novo em condomínio sem planilha de CPF: cadastro rápido para votar.
  if (etapa === "novoRosto") {
    return (
      <div>
        <div className="mb-1 flex items-center gap-2">
          <ScanFace className="h-6 w-6 text-primary-600" />
          <h1 className="text-lg font-bold">Primeiro acesso</h1>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Ainda não te conhecemos. Informe seu nome e unidade — na próxima
          assembleia é só mostrar o rosto.
        </p>

        {selfie && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie}
            alt="Sua foto"
            className="mx-auto mb-4 h-24 w-24 rounded-xl border border-gray-200 object-cover"
          />
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="input-field"
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Bloco
              </label>
              <input
                value={bloco}
                onChange={(e) => setBloco(e.target.value)}
                className="input-field"
                maxLength={20}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Apartamento
              </label>
              <input
                value={apartamento}
                onChange={(e) => setApartamento(e.target.value)}
                className="input-field"
                maxLength={20}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Perfil
            </label>
            <select
              value={perfil}
              onChange={(e) => setPerfil(e.target.value)}
              className="input-field"
            >
              {PERFIS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={lgpd}
              onChange={(e) => setLgpd(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span>
              Concordo que meu rosto e minha foto sejam usados para me identificar
              nas assembleias deste condomínio (LGPD).
            </span>
          </label>
        </div>

        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

        <button
          onClick={cadastrarEEntrar}
          disabled={processando}
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          {processando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Entrando...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> Confirmar e votar
            </>
          )}
        </button>
        <button
          onClick={onManual}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Camera className="h-4 w-4" /> Prefiro tirar só a selfie
        </button>
        <button
          onClick={onEmail}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <Mail className="h-4 w-4" /> Ou entrar pelo e-mail
        </button>
      </div>
    );
  }

  // Portão de CPF: primeiro passo. O morador digita o CPF e o sistema já traz
  // nome/bloco/apartamento; a foto vem depois, só para confirmar.
  if (etapa === "cpf") {
    const digitos = cpf.replace(/\D/g, "");
    const cpfValido = digitos.length === 11 || digitos.length === 14;
    return (
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-primary-600" />
          Digite o seu CPF
        </label>
        <p className="mb-3 text-xs text-gray-500">
          É só digitar o CPF que o sistema encontra a sua unidade. Na tela
          seguinte você confere se os dados estão certos — se não estiverem,
          corrige na hora. Depois é a foto, que só confirma que é você.
        </p>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={cpf}
          onChange={(e) => {
            setCpf(e.target.value);
            setErroCpf("");
            setUnidadesCpf(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cpfValido && !consultandoCpf) consultarCpf();
          }}
          placeholder="000.000.000-00"
          className="input-field w-full text-center text-lg tracking-widest"
          disabled={consultandoCpf}
        />
        <button
          onClick={consultarCpf}
          disabled={!cpfValido || consultandoCpf}
          className="btn-primary mt-3 w-full disabled:opacity-50"
        >
          {consultandoCpf ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Procurando...
            </span>
          ) : (
            "Continuar"
          )}
        </button>
        {erroCpf && <p className="mt-2 text-sm text-red-600">{erroCpf}</p>}

        {unidadesCpf && unidadesCpf.length > 1 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">
              Escolha a unidade (uma de cada vez):
            </p>
            {unidadesCpf.map((u, i) => (
              <button
                key={i}
                onClick={() => {
                  prepararUnidade(u);
                  setEtapa("confirmar");
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="block font-medium text-gray-800">{u.nome}</span>
                <span className="block text-xs text-gray-500">
                  {textoUnidade(u.bloco, u.apartamento)}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onManual}
          className="mt-4 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Camera className="h-4 w-4" /> Não tenho o CPF em mãos — tirar só a
          selfie
        </button>
        <button
          onClick={onEmail}
          className="mt-2 inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <Mail className="h-4 w-4" /> Ou entrar pelo e-mail
        </button>
      </div>
    );
  }

  // Etapa da câmera: com CPF, a foto só CONFIRMA quem já foi identificado.
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <ScanFace className="h-6 w-6 text-primary-600" />
        <h1 className="text-lg font-bold">
          {cpfHash ? "Agora é só a foto" : "Identifique-se pelo rosto"}
        </h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        {cpfHash
          ? temRostoCadastrado
            ? `Olhe para a câmera: a foto confirma que é você, ${
                nome.split(" ")[0] || "morador"
              }.`
            : "Olhe para a câmera. Esta primeira foto fica guardada como o seu cadastro."
          : "Olhe para a câmera para entrar e votar. Se já participou antes, é reconhecido na hora."}
      </p>

      {camAtiva ? (
        <div className="relative mx-auto mb-3 aspect-[3/4] max-h-72 overflow-hidden rounded-xl bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {/* Guia do enquadramento: fica verde quando a leitura vai disparar. */}
          <div
            className={`pointer-events-none absolute inset-x-8 inset-y-6 rounded-[50%] border-2 border-dashed transition-colors ${
              dicaAuto === "pronto" || dicaAuto === "segure"
                ? "border-green-400"
                : "border-white/60"
            }`}
          />
        </div>
      ) : (
        <div className="mx-auto mb-3 flex aspect-[3/4] max-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400">
          <Camera className="mb-2 h-10 w-10" />
          <span className="text-xs">Câmera desligada</span>
        </div>
      )}

      {precisaLgpd && (
        <label className="mb-3 flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={lgpd}
            onChange={(e) => setLgpd(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            Concordo que meu rosto e minha foto sejam usados para me identificar
            nas assembleias deste condomínio (LGPD).
          </span>
        </label>
      )}

      {camAtiva && !erro && (
        <p className="mb-3 text-center text-sm text-gray-500">
          {processando
            ? "Fique parado, olhando para a câmera."
            : precisaLgpd && !lgpd
            ? "Marque o aceite acima para a foto ser tirada."
            : textoDica(dicaAuto) ||
              "Olhe para a câmera. A leitura acontece sozinha."}
        </p>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {camAtiva ? (
        <button
          onClick={lerRosto}
          disabled={processando || (precisaLgpd && !lgpd)}
          className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          {processando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo rosto...
            </>
          ) : (
            <>
              <ScanFace className="h-4 w-4" /> Tirar a foto agora
            </>
          )}
        </button>
      ) : (
        <button
          onClick={abrirCamera}
          className="btn-primary flex w-full items-center justify-center gap-2"
        >
          <Camera className="h-4 w-4" /> Abrir câmera
        </button>
      )}

      {/* Sem CPF não dá para entrar só com a selfie por aqui: sem o rosto o
          servidor não saberia quem é a pessoa. Com CPF, a selfie substitui a
          biometria e a mesa confere. */}
      {cpfHash && falhas >= 2 && (
        <button
          onClick={entrarComSelfie}
          disabled={processando}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50"
        >
          <Camera className="h-4 w-4" /> A câmera não está reconhecendo — entrar
          com a selfie
        </button>
      )}

      {!cpfHash && (
        <button
          onClick={onManual}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <Camera className="h-4 w-4" /> Não consigo pelo rosto — tirar só a
          selfie
        </button>
      )}
      <button
        onClick={onEmail}
        className="mt-2 inline-flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <Mail className="h-4 w-4" /> Ou entrar pelo e-mail
      </button>
    </div>
  );
}

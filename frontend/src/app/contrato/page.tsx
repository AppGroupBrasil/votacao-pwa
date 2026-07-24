"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Share2,
  Check,
} from "lucide-react";

const planos = [
  {
    id: "completo",
    nome: "Plano Completo",
    valor: "R$ 199,00/mês por assembleia",
    items: [
      "Votação digital com biometria facial, WebAuthn e OTP",
      "Lista de presença digital com assinatura facial (SHA-256)",
      "Sem limite de votantes por assembleia",
      "Resultados em tempo real com painel administrativo",
      "Relatórios, ata digital e auditoria completa",
      "Bloqueio automático de inadimplentes",
      "Videochamada integrada com até 500 participantes",
      "Gravação completa da assembleia",
      "Transcrição automática por inteligência artificial",
      "Chat ao vivo exportável em PDF",
      "Compartilhamento de tela e documentos",
      "Sala de espera com verificação de identidade",
      "Suporte em tempo real durante a assembleia",
      "Conformidade total com a LGPD",
    ],
  },
  {
    id: "votacao",
    nome: "Plano Votação",
    valor: "R$ 299,00/mês (uso ilimitado)",
    items: [
      "Condomínios ilimitados",
      "Votações ilimitadas por mês",
      "Sem limite de votantes por assembleia",
      "Votação digital com biometria facial, WebAuthn e OTP",
      "Lista de presença digital com assinatura facial (SHA-256)",
      "Resultados em tempo real com painel administrativo",
      "Relatórios, ata digital e auditoria completa",
      "Bloqueio automático de inadimplentes",
      "Integração com Superlógica, Condomob e outros ERPs",
      "API aberta para integração personalizada",
      "Conformidade total com a LGPD",
    ],
    naoIncluso: [
      "Videochamada",
      "Gravação da assembleia",
      "Transcrição automática",
      "Chat ao vivo",
    ],
  },
];

export default function ContratoPage() {
  const [planoSelecionado, setPlanoSelecionado] = useState<string | null>(null);
  const plano = planos.find((p) => p.id === planoSelecionado);
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir / PDF
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copiado!");
              }}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Copiar Link
            </button>
          </div>
        </div>
      </header>

      {/* Contrato */}
      <main className="max-w-4xl mx-auto px-6 py-12 print:py-4 print:px-0">
        <div className="bg-white rounded-xl shadow-sm border p-8 md:p-12 print:shadow-none print:border-0">
          <h1 className="text-2xl md:text-3xl font-bold text-center mb-2">
            CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SOFTWARE
          </h1>
          <p className="text-center text-gray-400 text-sm mb-10">
            Modelo de Contrato — Votação Online
          </p>

          {/* Cláusula 1 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">1</span>
              DAS PARTES
            </h2>

            <div className="mb-4">
              <p className="font-semibold mb-1">CONTRATADA:</p>
              <p className="text-gray-700 text-sm leading-relaxed">
                <strong>APP GROUP LTDA - ME</strong> (Nome Fantasia: APP GROUP), pessoa jurídica de direito privado, inscrita no
                CNPJ sob nº <strong>51.797.070/0001-53</strong>, com sede na Av. Paulista, 1106, Sala 01, Bairro Bela Vista,
                CEP 01310-914, São Paulo/SP, neste ato representada por seu representante legal, doravante
                denominada simplesmente <strong>CONTRATADA</strong>.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-3">CONTRATANTE:</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  "Condomínio / Razão Social",
                  "CNPJ",
                  "Endereço",
                  "Nº",
                  "Bloco",
                  "Bairro",
                  "CEP",
                  "Cidade / UF",
                  "Síndico(a) / Representante Legal",
                  "CPF do Representante",
                ].map((label) => (
                  <div key={label} className={`${label === "Condomínio / Razão Social" || label === "Endereço" || label === "Síndico(a) / Representante Legal" ? "col-span-2" : ""}`}>
                    <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                    <div className="border-b border-gray-300 pb-1 min-h-[1.5rem]" />
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-3">
                Doravante denominado(a) simplesmente <strong>CONTRATANTE</strong>.
              </p>
            </div>
          </section>

          {/* Cláusula 2 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">2</span>
              DO OBJETO
            </h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-4">
              O presente contrato tem por objeto a prestação de serviços de licenciamento,
              hospedagem e manutenção do sistema <strong>&quot;Votação Online&quot;</strong>, plataforma digital
              (SaaS — Software as a Service) acessível via navegador web e dispositivos móveis,
              destinada à realização de assembleias e votações condominiais digitais com
              autenticação biométrica, compreendendo:
            </p>

            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-semibold text-gray-800 mb-2">Funcionalidades da Plataforma:</p>
              <ul className="space-y-1.5">
                {[
                  "Votação digital com autenticação em 3 camadas (biometria facial, WebAuthn e OTP por e-mail)",
                  "Reconhecimento facial 100% no dispositivo — nenhuma imagem sai do celular do votante",
                  "Lista de presença digital com assinatura facial criptografada (hash SHA-256 de 128 pontos faciais)",
                  "Painel administrativo para criação e gestão de assembleias e questões",
                  "Resultados em tempo real com contagem ao vivo",
                  "Relatórios completos, ata digital e auditoria com hash verificável para cada voto",
                  "Bloqueio automático de condôminos inadimplentes",
                  "Suporte a múltiplos condomínios e múltiplas assembleias simultâneas",
                  "Cadastro de eleitores por bloco, apartamento e perfil (proprietário ou procurador)",
                  "Conformidade total com a LGPD (Lei nº 13.709/2018)",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-gray-700">
                    <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Cláusula 3 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">3</span>
              DOS PLANOS E VALORES
            </h2>
            <p className="text-sm text-gray-700 mb-4">
              A CONTRATANTE deverá optar por um dos planos abaixo:
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {planos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlanoSelecionado(p.id)}
                  className={`text-left rounded-xl border-2 p-5 transition-all ${
                    planoSelecionado === p.id
                      ? "border-primary-500 bg-primary-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">{p.nome}</h3>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      planoSelecionado === p.id
                        ? "border-primary-500 bg-primary-500"
                        : "border-gray-300"
                    }`}>
                      {planoSelecionado === p.id && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-primary-700 mb-3">{p.valor}</p>
                  <ul className="space-y-1.5 text-xs text-gray-600">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-start gap-1.5">
                        <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {p.naoIncluso && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-400 font-medium mb-1">Não incluso:</p>
                      <p className="text-xs text-gray-400">{p.naoIncluso.join(", ")}</p>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>3.1.</strong> O valor será cobrado mensalmente, com vencimento todo dia <strong>10</strong> de cada mês.</p>
              <p><strong>3.2.</strong> O pagamento poderá ser realizado via boleto bancário, PIX ou cartão de crédito.</p>
              <p><strong>3.3.</strong> Não haverá cobrança de taxa de adesão ou implantação.</p>
            </div>
          </section>

          {/* Cláusula 4 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">4</span>
              DO PERÍODO DE TESTE
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>4.1.</strong> A CONTRATANTE terá direito a um período de teste gratuito de <strong>7 (sete) dias corridos</strong>, contados a partir da ativação do sistema.</p>
              <p><strong>4.2.</strong> Ao término do período de teste, caso a CONTRATANTE não manifeste interesse na continuidade, o acesso será suspenso automaticamente, sem qualquer cobrança.</p>
            </div>
          </section>

          {/* Cláusula 5 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">5</span>
              DA VIGÊNCIA
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>5.1.</strong> O presente contrato terá vigência por prazo indeterminado, iniciando-se na data de sua assinatura.</p>
              <p><strong>5.2.</strong> <strong>NÃO HÁ FIDELIDADE.</strong> Qualquer das partes poderá rescindir o presente contrato a qualquer tempo, mediante comunicação prévia de 30 (trinta) dias.</p>
              <p><strong>5.3.</strong> Não haverá multa por rescisão antecipada.</p>
            </div>
          </section>

          {/* Cláusula 6 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">6</span>
              DAS OBRIGAÇÕES DA CONTRATADA
            </h2>
            <p className="text-sm text-gray-700 mb-3">A CONTRATADA se obriga a:</p>
            <ul className="text-sm text-gray-700 space-y-2">
              {[
                "Disponibilizar o sistema 24 horas por dia, 7 dias por semana, com disponibilidade mínima de 99,5% ao mês;",
                "Prestar suporte técnico por WhatsApp em horário comercial (segunda a sexta, 08h às 18h);",
                "Realizar atualizações e melhorias contínuas no sistema sem custo adicional;",
                "Manter backup diário dos dados da CONTRATANTE;",
                "Garantir a segurança e confidencialidade dos dados armazenados, em conformidade com a LGPD (Lei nº 13.709/2018);",
                "Garantir que nenhuma imagem facial ou dado biométrico bruto trafegue pela rede — todo o processamento biométrico ocorre exclusivamente no dispositivo do votante.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-primary-500 mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Cláusula 7 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">7</span>
              DAS OBRIGAÇÕES DA CONTRATANTE
            </h2>
            <p className="text-sm text-gray-700 mb-3">A CONTRATANTE se obriga a:</p>
            <ul className="text-sm text-gray-700 space-y-2">
              {[
                "Efetuar o pagamento mensal na data de vencimento;",
                "Fornecer informações corretas e atualizadas para cadastro no sistema;",
                "Não compartilhar credenciais de acesso com terceiros não autorizados;",
                "Utilizar o sistema de acordo com a legislação vigente e boas práticas;",
                "Comunicar imediatamente qualquer irregularidade ou falha detectada no sistema.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-primary-500 mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* Cláusula 8 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">8</span>
              DA PROTEÇÃO DE DADOS (LGPD)
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>8.1.</strong> A CONTRATADA se compromete a tratar os dados pessoais coletados pelo sistema em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), atuando como <strong>Operadora de Dados</strong>.</p>
              <p><strong>8.2.</strong> Os dados pessoais de moradores e eleitores cadastrados no sistema são de responsabilidade da CONTRATANTE (<strong>Controladora de Dados</strong>).</p>
              <p><strong>8.3.</strong> Dados biométricos faciais são processados exclusivamente no dispositivo do votante. O servidor armazena apenas hashes criptográficos irreversíveis (SHA-256), impossibilitando a reconstrução de qualquer imagem facial.</p>
              <p><strong>8.4.</strong> Em caso de rescisão contratual, a CONTRATADA manterá os dados por até <strong>90 (noventa) dias</strong> para eventual migração, após os quais serão definitivamente excluídos.</p>
            </div>
          </section>

          {/* Cláusula 9 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">9</span>
              DA PROPRIEDADE INTELECTUAL
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>9.1.</strong> O sistema &quot;Votação Online&quot;, incluindo código-fonte, design, documentação e marca, é de propriedade exclusiva da <strong>APP GROUP LTDA - ME</strong>.</p>
              <p><strong>9.2.</strong> O presente contrato não transfere qualquer direito de propriedade intelectual à CONTRATANTE, que recebe apenas licença de uso não-exclusiva durante a vigência contratual.</p>
            </div>
          </section>

          {/* Cláusula 10 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">10</span>
              DO REAJUSTE
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>10.1.</strong> Os valores poderão ser reajustados anualmente com base no índice IGPM/FGV ou, na sua ausência, pelo IPCA/IBGE.</p>
              <p><strong>10.2.</strong> Qualquer reajuste será comunicado com antecedência mínima de <strong>30 (trinta) dias</strong>.</p>
            </div>
          </section>

          {/* Cláusula 11 */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">11</span>
              DA RESCISÃO
            </h2>
            <div className="text-sm text-gray-700 space-y-2">
              <p><strong>11.1.</strong> O presente contrato poderá ser rescindido:</p>
              <ul className="ml-4 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-1">•</span>
                  Por qualquer das partes, a qualquer tempo, <strong>sem multa</strong>, mediante aviso prévio de 30 dias;
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-1">•</span>
                  Por inadimplência da CONTRATANTE superior a 5 (cinco) dias;
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-500 mt-1">•</span>
                  Por descumprimento de qualquer cláusula contratual, após notificação e prazo de 5 (cinco) dias para regularização.
                </li>
              </ul>
            </div>
          </section>

          {/* Cláusula 12 */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-primary-700 mb-4 flex items-center gap-2">
              <span className="bg-primary-100 text-primary-700 text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center">12</span>
              DO FORO
            </h2>
            <p className="text-sm text-gray-700">
              Fica eleito o foro da Comarca de <strong>São Paulo/SP</strong> para dirimir quaisquer dúvidas
              oriundas do presente contrato, com renúncia expressa a qualquer outro, por mais
              privilegiado que seja.
            </p>
          </section>

          {/* Resumo */}
          <section className="mb-10 bg-gray-50 rounded-xl p-6 border">
            <h2 className="font-bold text-lg mb-4 text-center">RESUMO DOS SERVIÇOS CONTRATADOS</h2>
            {plano ? (
              <div className="text-sm">
                <div className="flex items-center justify-between bg-white rounded-lg p-4 border mb-3">
                  <div>
                    <p className="font-bold text-primary-700">{plano.nome}</p>
                    <p className="text-gray-500 text-xs">{plano.valor}</p>
                  </div>
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <ul className="space-y-1 text-gray-600 text-xs">
                  {plano.items.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-center text-gray-400 text-sm py-4">
                Nenhum plano selecionado — selecione na Cláusula 3ª
              </p>
            )}
          </section>

          {/* Data e assinaturas */}
          <section className="text-sm text-gray-700">
            <div className="mb-6 bg-primary-50 rounded-lg p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">DATA DE INÍCIO DA VIGÊNCIA</p>
              <p className="font-semibold">A partir de: {hoje}</p>
              <p className="text-xs text-gray-500 mt-1">
                Vencimento mensal: dia 10 de cada mês • Forma de pagamento: boleto, PIX ou cartão
              </p>
            </div>

            <p className="mb-8 leading-relaxed">
              E por estarem assim justas e contratadas, as partes assinam o presente
              instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas)
              testemunhas.
            </p>

            <p className="text-center mb-10 font-semibold">São Paulo, {hoje}.</p>

            <div className="grid md:grid-cols-2 gap-10 mb-10">
              <div className="text-center">
                <p className="font-bold mb-1">CONTRATADA</p>
                <div className="border-b border-gray-400 mb-1 mt-10" />
                <p className="font-semibold">APP GROUP LTDA - ME</p>
                <p className="text-xs text-gray-500">CNPJ: 51.797.070/0001-53</p>
              </div>
              <div className="text-center">
                <p className="font-bold mb-1">CONTRATANTE</p>
                <div className="border-b border-gray-400 mb-1 mt-10" />
                <p className="text-gray-400">________________________</p>
                <p className="text-xs text-gray-500">CNPJ: ___.___.___/____-__</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
              <div className="text-center">
                <p className="font-bold mb-1">TESTEMUNHA 1</p>
                <div className="border-b border-gray-400 mb-1 mt-10" />
                <p className="text-xs text-gray-500">CPF: ___.___.___-__</p>
              </div>
              <div className="text-center">
                <p className="font-bold mb-1">TESTEMUNHA 2</p>
                <div className="border-b border-gray-400 mb-1 mt-10" />
                <p className="text-xs text-gray-500">CPF: ___.___.___-__</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

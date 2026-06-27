import Link from "next/link";
import {
  Shield,
  Fingerprint,
  Vote,
  Users,
  BarChart3,
  QrCode,
  Video,
  FileText,
  Check,
  Ban,
  UserPlus,
  ScanFace,
  CheckCircle,
  ClipboardList,
  ClipboardCheck,
  Clock,
  MapPin,
  Eye,
  FileText as FileContract,
  Scale,
  Link2,
  Sparkles,
  ListChecks,
  PenLine,
} from "lucide-react";

const features = [
  {
    icon: Fingerprint,
    title: "Biometria Facial",
    desc: "Reconhecimento facial rodando 100% no celular. Nenhuma imagem sai do dispositivo.",
  },
  {
    icon: Shield,
    title: "WebAuthn",
    desc: "Digital, Face ID ou PIN como fallback — a mesma tecnologia dos bancos digitais.",
  },
  {
    icon: Vote,
    title: "Votação Segura",
    desc: "Cada voto gera um hash verificável. Registro imutável para auditoria.",
  },
  {
    icon: Users,
    title: "Sem Limite de Votantes",
    desc: "Suporta assembleias de qualquer porte — de dezenas a milhares de unidades.",
  },
  {
    icon: BarChart3,
    title: "Resultados em Tempo Real",
    desc: "Painel administrativo com contagem ao vivo e relatório PDF.",
  },
  {
    icon: QrCode,
    title: "Acesso Fácil",
    desc: "Vote pelo site, pelo aplicativo ou receba o link direto no WhatsApp.",
  },
  {
    icon: Link2,
    title: "Votação Simples por Link",
    desc: "Crie uma enquete em segundos e compartilhe um link. Voto secreto (anônimo) ou aberto (identifica quem votou), com resultado e PDF.",
  },
  {
    icon: Video,
    title: "Gravação da Assembleia",
    desc: "Gravação completa da reunião para até 500 participantes simultâneos.",
  },
  {
    icon: Sparkles,
    title: "Resumo e Ata com IA",
    desc: "A partir da gravação, a IA gera a transcrição, um resumo dos pontos principais e a ata formal — editável e exportável em TXT ou PDF.",
  },
  {
    icon: ListChecks,
    title: "Controle de Votação",
    desc: "Painel exclusivo do síndico e da administradora: acompanhe em tempo real quem já votou e quem falta — sem nunca revelar em qual opção cada um votou.",
  },
  {
    icon: PenLine,
    title: "Lista de Presença Manual",
    desc: "Gere um link público e colete presença com selfie, nome, bloco, apartamento e assinatura na tela do celular — ideal para visitantes e quem não tem cadastro.",
  },
  {
    icon: Ban,
    title: "Bloqueio de Inadimplentes",
    desc: "Condôminos inadimplentes são bloqueados automaticamente e não conseguem votar.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white">
        <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Vote className="w-7 h-7" />
            <span className="font-bold text-lg">Votação Online</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login" className="btn-secondary !text-sm !py-2 !px-4">
              Entrar
            </Link>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            Votação Online com{" "}
            <span className="text-accent-300">Biometria Facial</span>
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-white mb-6">
            Vote sem sair da sala online — pelo sistema, em tempo real
          </p>
          <p className="text-lg md:text-xl text-primary-200 max-w-2xl mx-auto mb-8">
            Sistema seguro para assembleias de condomínio. Autenticação em
            camadas, registro imutável de votos e integração com Meet e Zoom.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/login" className="btn-primary !text-base !py-3 !px-8">
              Acessar Sistema
            </Link>
            <a
              href="#como-funciona"
              className="btn-secondary !text-base !py-3 !px-8"
            >
              Como Funciona
            </a>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Segurança em Camadas
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          Nenhuma imagem ou dado biométrico trafega pela rede. O servidor nunca
          vê dados biométricos brutos.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card group hover:shadow-md transition-shadow">
              <f.icon className="w-10 h-10 text-primary-600 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destaque Segurança */}
      <section className="bg-primary-800 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Shield className="w-14 h-14 text-accent-300 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Impeça que pessoas não autorizadas votem
          </h2>
          <p className="text-xl text-primary-200 max-w-2xl mx-auto mb-6">
            Tenha a certeza de que quem votou está autorizado a votar.
            Autenticação biométrica em 3 camadas garante que cada voto é legítimo.
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-white text-sm">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-accent-300" />
              <span>Reconhecimento facial</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-accent-300" />
              <span>Digital / Face ID / PIN</span>
            </div>
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-accent-300" />
              <span>Inadimplentes bloqueados</span>
            </div>
          </div>
        </div>
      </section>

      {/* Lista de Presença Digital */}
      <section className="bg-gradient-to-br from-accent-50 to-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <ClipboardCheck className="w-14 h-14 text-accent-600 mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Lista de Presença Digital
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Confirmada automaticamente pela biometria facial — sem papel, sem
              assinatura, sem fraude. O síndico ainda pode marcar presença
              manualmente, inclusive de visitantes sem cadastro.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: ScanFace,
                title: "Confirmação Biométrica",
                desc: "Ao se autenticar para votar, a presença é registrada automaticamente. Não há como assinar por outro morador.",
              },
              {
                icon: Clock,
                title: "Horário Exato",
                desc: "Cada registro inclui data, hora e método de autenticação utilizado — biometria, WebAuthn ou OTP.",
              },
              {
                icon: MapPin,
                title: "Bloco e Apartamento",
                desc: "A lista mostra nome, bloco, unidade e perfil (proprietário, inquilino ou procurador) de cada presente.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
              >
                <item.icon className="w-9 h-9 text-primary-600 mb-3" />
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-w-2xl mx-auto">
            <div className="bg-primary-700 text-white px-5 py-3 flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="w-4 h-4" />
              Lista de Presença — Assembleia Ordinária
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-5 py-2">Nome</th>
                  <th className="text-left px-5 py-2">Bloco / Apto</th>
                  <th className="text-left px-5 py-2">Presença</th>
                  <th className="text-left px-5 py-2">Assinatura Facial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { nome: "Maria Silva", local: "A / 301", hora: "19:02", hash: "a72e5e8a7f3f8e4c" },
                  { nome: "João Santos", local: "B / 104", hora: "19:05", hash: "3b9d1c4f6e2a8b5d" },
                  { nome: "Ana Oliveira", local: "C / 702", hora: "19:08", hash: "f1c8e3a2d6b4970e" },
                ].map((p) => (
                  <tr key={p.nome}>
                    <td className="px-5 py-3 font-medium">{p.nome}</td>
                    <td className="px-5 py-3 text-gray-500">{p.local}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {p.hora}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                        {p.hash}…
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4 max-w-2xl mx-auto">
            O vetor facial tem <strong>128 números</strong> (face-api.js), convertidos em{" "}
            <strong>hash SHA-256 de 64 caracteres hexadecimais</strong> — esse código
            funciona como prova criptográfica de que a biometria facial foi verificada.
          </p>
        </div>
      </section>

      {/* Como Funciona a Votação */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Como Funciona a Votação
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          Do convite ao resultado — tudo online, seguro e sem complicação.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              icon: UserPlus,
              step: "1",
              title: "Cadastro do Morador",
              desc: "Importe via planilha Excel, PDF ou pelo nosso suporte. O morador registra sua biometria pelo celular.",
            },
            {
              icon: ClipboardList,
              step: "2",
              title: "Assembleia é Criada",
              desc: "Defina as pautas e questões. Inadimplentes são bloqueados automaticamente.",
            },
            {
              icon: ScanFace,
              step: "3",
              title: "Morador Vota",
              desc: "Confirma identidade pela biometria e vota sem sair da sala online.",
            },
            {
              icon: CheckCircle,
              step: "4",
              title: "Resultado Imediato",
              desc: "Contagem em tempo real. Ata, transcrição e gravação disponíveis para download.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                <item.icon className="w-7 h-7 text-primary-600" />
                <span className="absolute -top-1 -right-1 w-6 h-6 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {item.step}
                </span>
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-gray-600 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Auth Flow */}
      <section className="bg-primary-50 py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Fluxo de Autenticação
          </h2>
          <div className="space-y-6">
            {[
              {
                step: "1ª Camada",
                title: "Biometria Facial",
                desc: "Câmera abre → compara com vetor local → se bater, voto liberado.",
                color: "bg-primary-600",
              },
              {
                step: "2ª Camada",
                title: "WebAuthn (Fallback)",
                desc: "Digital, Face ID ou PIN do celular — modal nativo igual ao banco.",
                color: "bg-primary-500",
              },
              {
                step: "3ª Camada",
                title: "OTP por Email",
                desc: "Código de 6 dígitos com validade de 10 minutos.",
                color: "bg-primary-400",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 items-start">
                <div
                  className={`${item.color} text-white text-xs font-bold py-1 px-3 rounded-full shrink-0 mt-1`}
                >
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Explicação privacidade facial */}
          <div className="mt-10 bg-white rounded-xl p-6 border border-primary-200">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-600" />
              Sua privacidade é garantida
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Nós <strong>não armazenamos nenhuma foto ou imagem facial</strong>. O reconhecimento
              funciona assim: ao cadastrar, a câmera do seu celular captura pontos do rosto e
              gera um código numérico criptografado. Apenas esse código é salvo — nunca a imagem.
              Na hora de votar, o mesmo processo é repetido e os códigos são comparados
              diretamente no seu celular. Nenhuma imagem é enviada para o servidor.
            </p>
          </div>
        </div>
      </section>

      {/* Transparência Total */}
      <section className="bg-gray-900 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <Eye className="w-14 h-14 text-accent-300 mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Transparência Total
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Nosso contrato é público e acessível. Sem letras miudas, sem surpresas,
              sem fidelidade. Leia antes de contratar.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: FileContract,
                title: "Contrato Público",
                desc: "O contrato completo está disponível para leitura a qualquer momento. Sem cláusulas escondidas.",
              },
              {
                icon: Scale,
                title: "Sem Fidelidade",
                desc: "Cancele quando quiser, sem multa. Aviso prévio de apenas 30 dias. Seus dados ficam disponíveis por 90 dias.",
              },
              {
                icon: Shield,
                title: "LGPD Garantida",
                desc: "Dados biométricos nunca saem do celular. O servidor armazena apenas hashes criptográficos irreversíveis.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700"
              >
                <item.icon className="w-9 h-9 text-accent-300 mb-3" />
                <h3 className="font-semibold text-lg text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/contrato"
              className="inline-flex items-center gap-2 bg-white text-gray-900 font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FileContract className="w-5 h-5" />
              Ler Contrato Completo
            </Link>
          </div>
        </div>
      </section>

      {/* Preços e Planos */}
      <section id="precos" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Preços e Planos
        </h2>
        <p className="text-gray-600 text-center max-w-2xl mx-auto mb-12">
          Escolha o plano ideal para o seu condomínio. Sem fidelidade, cancele quando quiser.
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Plano Completo */}
          <div className="card border-2 border-primary-500 flex flex-col">
            <h3 className="font-bold text-xl mb-1">Plano Completo</h3>
            <p className="text-gray-500 text-sm mb-6">Votação + assembleia virtual integrada</p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-sm text-gray-500">R$</span>
              <span className="text-5xl font-bold text-primary-700">199</span>
              <span className="text-gray-500">por assembleia</span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Tudo do Plano Votação",
                "Videochamada com até 500 participantes",
                "Gravação completa da assembleia",
                "Resumo e ata da assembleia por IA",
                "Chat ao vivo exportável em PDF",
                "Compartilhamento de tela e documentos",
                "Sala de espera com verificação de identidade",
                "Suporte em tempo real durante a assembleia",
              ].map((item, i) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className={`w-4 h-4 shrink-0 mt-0.5 ${i === 0 ? "text-primary-600" : item === "Suporte em tempo real durante a assembleia" ? "text-primary-600" : "text-green-500"}`} />
                  <span className={i === 0 || item === "Suporte em tempo real durante a assembleia" ? "text-primary-700 font-semibold" : ""}>{item}</span>
                </li>
              ))}
            </ul>

            <Link href="/login" className="btn-primary w-full text-center block">
              Começar Agora
            </Link>
          </div>

          {/* Plano Votação */}
          <div className="card border-2 border-gray-200 flex flex-col">
            <h3 className="font-bold text-xl mb-1">Plano Votação</h3>
            <p className="text-gray-500 text-sm mb-6">Sistema completo de votação digital</p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-sm text-gray-500">R$</span>
              <span className="text-5xl font-bold text-primary-700">350</span>
              <span className="text-gray-500">/mês</span>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "Uso ilimitado de todo o sistema",
                "Condomínios e votações ilimitados",
                "Sem limite de votantes por assembleia",
                "Votação simples por link (secreta ou aberta)",
                "Biometria facial + WebAuthn + OTP",
                "Lista de presença digital com assinatura facial",
                "Lista de presença manual (selfie + assinatura)",
                "Controle de votação: quem votou e quem falta",
                "Resultados em tempo real",
                "Relatórios e auditoria completa",
                "Bloqueio automático de inadimplentes",
                "Integração com Superlógica, Condomob e outros ERPs",
                "API aberta para integração personalizada",
                "Conformidade total com a LGPD",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-green-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mb-4 bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Não incluso neste plano:</p>
              <p className="text-xs text-gray-400">Videochamada, gravação da assembleia, resumo e ata por IA e chat ao vivo.</p>
            </div>

            <Link href="/login" className="btn-secondary w-full text-center block">
              Começar Agora
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Todos os planos incluem atualizações gratuitas, suporte por e-mail e conformidade com a LGPD.
        </p>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm">
          <p>© 2026 Votação Online — Sistema de Votação com Biometria Facial</p>
          <p className="mt-1">Conformidade LGPD • Dados biométricos nunca saem do dispositivo</p>
        </div>
      </footer>

      {/* WhatsApp Flutuante */}
      <a
        href="https://wa.me/5511933284364"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Fale conosco pelo WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
      >
        <svg viewBox="0 0 32 32" className="w-7 h-7 fill-white">
          <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16.004c0 3.5 1.132 6.744 3.054 9.378L1.056 31.2l6.044-1.94a15.9 15.9 0 008.904 2.724C24.828 31.984 32 24.808 32 16.004S24.828 0 16.004 0zm9.32 22.608c-.392 1.104-1.94 2.02-3.16 2.288-.836.18-1.928.324-5.604-1.204-4.7-1.956-7.724-6.724-7.956-7.036-.224-.312-1.876-2.496-1.876-4.764s1.188-3.376 1.608-3.84c.42-.464.92-.58 1.228-.58.308 0 .612.004.88.016.284.012.664-.108.94.716.308.896 1.044 3.068 1.136 3.292.092.224.152.488.032.788-.12.308-.18.496-.356.768-.176.272-.372.608-.532.816-.176.224-.36.464-.156.908.204.444.908 1.792 1.948 2.904 1.34 1.432 2.468 1.876 2.82 2.084.352.208.556.176.76-.104.204-.284.876-1.02 1.108-1.372.232-.352.464-.296.784-.176.32.12 2.032.96 2.38 1.132.352.176.584.264.672.408.088.14.088.82-.308 1.924z" />
        </svg>
      </a>
    </div>
  );
}

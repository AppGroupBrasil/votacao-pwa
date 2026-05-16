import Link from "next/link";

export const metadata = {
  title: "Termos de Uso — Votação Online",
};

export default function TermosPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm sm:prose">
      <h1>Termos de Uso</h1>
      <p><em>Última atualização: 08 de maio de 2026</em></p>

      <h2>1. Objeto</h2>
      <p>
        O Votação Online é um serviço web destinado à realização de assembleias
        digitais de condomínios, permitindo cadastro de eleitores, autenticação
        biométrica/WebAuthn/OTP e registro auditável de votos.
      </p>

      <h2>2. Cadastro</h2>
      <p>
        O administrador (síndico ou administradora) é responsável por cadastrar
        os eleitores autorizados, conforme convenção do condomínio. O eleitor
        recebe um convite por e-mail e deve concluir o onboarding antes da
        assembleia.
      </p>

      <h2>3. Voto</h2>
      <ul>
        <li>Cada eleitor pode votar uma única vez por questão.</li>
        <li>O voto é registrado com data, método de autenticação e um hash de comprovação que pode ser verificado posteriormente.</li>
        <li>Votos não podem ser alterados após o encerramento da assembleia.</li>
        <li>Tentativas de fraude (compartilhamento de credenciais, automação) acarretam invalidação do voto e responsabilização legal.</li>
      </ul>

      <h2>4. Disponibilidade</h2>
      <p>
        O serviço é fornecido em regime de melhor esforço. Embora aplicamos
        backups diários e monitoramento, não há garantia formal de SLA.
        Falhas técnicas devem ser comunicadas pelo e-mail de suporte.
      </p>

      <h2>5. Propriedade intelectual</h2>
      <p>
        O sistema, marca, código-fonte e materiais associados são de propriedade
        do operador. O uso é licenciado durante a vigência do contrato com o
        condomínio.
      </p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>
        O operador não responde por (i) decisões tomadas pelos condôminos com
        base nos resultados da assembleia, (ii) indisponibilidade decorrente de
        terceiros (provedor de internet, hospedagem) ou (iii) uso indevido por
        parte de eleitores ou administradores.
      </p>

      <h2>7. Foro</h2>
      <p>
        Aplica-se a legislação brasileira, eleito o foro do domicílio do
        contratante para dirimir controvérsias.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-primary-600 underline">← Voltar</Link>
        {" · "}
        <Link href="/privacidade" className="text-primary-600 underline">Política de Privacidade</Link>
      </p>
    </main>
  );
}

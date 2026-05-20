import Link from "next/link";

export const metadata = {
  title: "Excluir Conta — Votação Online",
  description:
    "Solicite a exclusão da sua conta e dos seus dados pessoais no Votação Online.",
};

export default function ExcluirContaPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm sm:prose">
      <h1>Excluir conta e dados</h1>
      <p><em>Última atualização: 20 de maio de 2026</em></p>

      <p>
        Conforme o art. 18 da LGPD (Lei 13.709/2018), você pode solicitar a
        exclusão da sua conta de eleitor e dos dados pessoais associados ao
        app <strong>Votação Online</strong> (com.appvotacao.app).
      </p>

      <h2>Como solicitar</h2>
      <p>
        Envie um e-mail para{" "}
        <a href="mailto:contato@appvotacao.com.br?subject=Exclus%C3%A3o%20de%20conta%20-%20Vota%C3%A7%C3%A3o%20Online">
          contato@appvotacao.com.br
        </a>{" "}
        com o assunto <em>&quot;Exclusão de conta - Votação Online&quot;</em> e informe:
      </p>
      <ul>
        <li>Nome completo</li>
        <li>E-mail cadastrado</li>
        <li>Condomínio (nome ou CNPJ)</li>
        <li>Bloco e apartamento</li>
      </ul>
      <p>
        A solicitação é processada em até <strong>15 dias úteis</strong>.
        Você receberá uma confirmação por e-mail quando a exclusão for concluída.
      </p>

      <h2>Dados excluídos</h2>
      <ul>
        <li>Nome, e-mail, bloco, apartamento e perfil de eleitor.</li>
        <li>Hash do CPF.</li>
        <li>Hash biométrico facial (se cadastrado).</li>
        <li>Credenciais WebAuthn (chave pública do dispositivo).</li>
      </ul>

      <h2>Dados retidos por obrigação legal</h2>
      <p>
        Os <strong>registros de voto</strong> (data, método de autenticação e
        hash do voto) são mantidos pelo prazo legal de guarda da ata da
        assembleia (mínimo 5 anos), conforme Código Civil art. 1.354 e
        seguintes. Esses registros ficam anonimizados (desvinculados do seu
        nome) após a exclusão da conta.
      </p>

      <h2>Contato do encarregado (DPO)</h2>
      <p>
        Para outras solicitações relativas à LGPD, contate{" "}
        <a href="mailto:contato@appvotacao.com.br">contato@appvotacao.com.br</a>.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-primary-600 underline">← Voltar</Link>{" "}
        ·{" "}
        <Link href="/privacidade" className="text-primary-600 underline">
          Política de Privacidade
        </Link>
      </p>
    </main>
  );
}

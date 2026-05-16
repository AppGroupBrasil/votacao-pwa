import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade — Votação Online",
};

export default function PrivacidadePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm sm:prose">
      <h1>Política de Privacidade</h1>
      <p><em>Última atualização: 08 de maio de 2026</em></p>

      <p>
        Esta política descreve como o sistema <strong>Votação Online</strong> (<a href="https://appvotacao.com.br">appvotacao.com.br</a>),
        operado para realização de assembleias condominiais digitais, coleta, usa
        e protege dados pessoais, em conformidade com a Lei Geral de Proteção
        de Dados (LGPD — Lei 13.709/2018).
      </p>

      <h2>1. Dados coletados</h2>
      <ul>
        <li><strong>Identificação do eleitor:</strong> nome, CPF (armazenado em hash), e-mail, bloco e apartamento.</li>
        <li><strong>Dados biométricos (opcional):</strong> hash do vetor facial usado apenas para autenticação no momento do voto. Não armazenamos imagens.</li>
        <li><strong>Credencial WebAuthn (opcional):</strong> chave pública vinculada ao dispositivo do eleitor.</li>
        <li><strong>Registros de voto:</strong> data, método de autenticação, hash de comprovação. O voto em si é vinculado ao eleitor para fins de auditoria condominial, conforme convencional em assembleias presenciais.</li>
        <li><strong>Logs técnicos:</strong> IP e user-agent são registrados temporariamente para auditoria de segurança e não são exibidos em relatórios.</li>
      </ul>

      <h2>2. Finalidades</h2>
      <ul>
        <li>Autenticar o eleitor e garantir que cada um vote uma única vez por questão.</li>
        <li>Apurar e divulgar os resultados das assembleias.</li>
        <li>Atender obrigações legais (registro em ata, auditoria) do condomínio.</li>
      </ul>

      <h2>3. Base legal</h2>
      <p>
        O tratamento ocorre com base em (i) execução de obrigação contratual com
        o condomínio, (ii) cumprimento de obrigação legal (Código Civil, art. 1.354
        e seguintes) e (iii) legítimo interesse do condomínio na deliberação
        coletiva.
      </p>

      <h2>4. Compartilhamento</h2>
      <p>
        Não vendemos nem compartilhamos dados com terceiros para fins
        publicitários. Provedores de infraestrutura utilizados:
      </p>
      <ul>
        <li>Hospedagem: Hetzner (UE)</li>
        <li>Envio de e-mail: Resend (EUA — adequação verificada via cláusulas contratuais padrão)</li>
        <li>Monitoramento de erros: Sentry</li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        Utilizamos apenas cookies <em>essenciais</em> de autenticação
        (HttpOnly, Secure, SameSite=Lax). Não há cookies de publicidade ou
        rastreamento de terceiros.
      </p>

      <h2>6. Retenção</h2>
      <ul>
        <li>Registros de voto: mantidos pelo prazo legal de guarda da ata da assembleia (mínimo 5 anos).</li>
        <li>Logs de acesso: 90 dias.</li>
        <li>Backups: 7 dias rotativos.</li>
      </ul>

      <h2>7. Direitos do titular</h2>
      <p>
        Você pode solicitar acesso, correção, anonimização ou exclusão de seus
        dados, conforme art. 18 da LGPD, pelo e-mail{" "}
        <a href="mailto:contato@appvotacao.com.br">contato@appvotacao.com.br</a>.
        Algumas solicitações podem ser limitadas por exigências legais
        (registros de votação são imutáveis após o encerramento da assembleia).
      </p>

      <h2>8. Segurança</h2>
      <p>
        Senhas e segredos são armazenados com hash. A comunicação é cifrada com
        TLS. Tokens de autenticação ficam em cookies HttpOnly. O acesso ao
        servidor é restrito por chave SSH.
      </p>

      <h2>9. Encarregado (DPO)</h2>
      <p>
        Para assuntos relativos à LGPD, contate{" "}
        <a href="mailto:contato@appvotacao.com.br">contato@appvotacao.com.br</a>.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-primary-600 underline">← Voltar</Link>
        {" · "}
        <Link href="/termos" className="text-primary-600 underline">Termos de uso</Link>
      </p>
    </main>
  );
}

import Link from "next/link";
import { EMAIL_CONTATO, Secao } from "@/components/legal/Secao";

export function PrivacidadePt() {
  return (
    <>
      <Secao titulo="1. Quem somos">
        <p>
          O <strong>NIDO Studio</strong> (&quot;NIDO&quot;, &quot;nós&quot;) é
          uma ferramenta para criar e gerenciar influenciadores sintéticos:
          ficha do personagem, imagens, vídeos, voz e publicação nas redes
          sociais. O serviço fica em{" "}
          <a href="https://aistudio.nido.global">aistudio.nido.global</a>.
        </p>
        <p>
          Esta política explica quais dados pessoais tratamos, para que e
          quais são os seus direitos, de acordo com a Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018 — LGPD). Dúvidas e pedidos:{" "}
          <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </Secao>

      <Secao titulo="2. Dados que coletamos">
        <ul>
          <li>
            <strong>Dados da conta Google.</strong> Ao entrar com o Google,
            recebemos seu nome, endereço de e-mail e foto de perfil. Não
            recebemos sua senha nem temos acesso ao seu Gmail, Drive, contatos
            ou qualquer outro dado da sua conta Google.
          </li>
          <li>
            <strong>Conteúdo que você cria ou envia.</strong> Fichas de
            personagem, textos, imagens, vídeos, áudios e amostras de voz,
            links de vídeo que você cola e posts que você agenda.
          </li>
          <li>
            <strong>Contas de redes sociais conectadas.</strong> Quando você
            conecta uma rede para publicar, guardamos a identificação dessa
            conexão e o histórico dos posts. As credenciais de acesso ficam
            com o provedor de publicação, não conosco.
          </li>
          <li>
            <strong>Pagamentos.</strong> Plano contratado, compras de
            créditos, valores, datas e status. Dados de cartão são tratados
            diretamente pelo processador de pagamento; nós não os armazenamos.
            Em pagamentos com USDC, registramos a rede e a transação
            correspondente, que são públicas na blockchain.
          </li>
          <li>
            <strong>Uso do serviço.</strong> Saldo e movimentação de créditos,
            contadores de uso e limites, declarações de autorização que você
            aceita e registros técnicos (data, hora, endereço IP e erros)
            necessários para operar e proteger o serviço.
          </li>
        </ul>
        <p>
          Sem login, o app funciona em modo local: os personagens ficam
          salvos apenas no seu navegador e não são enviados aos nossos
          servidores até você criar uma conta.
        </p>
      </Secao>

      <Secao titulo="3. Para que usamos os dados">
        <ul>
          <li>Autenticar você e manter sua sessão.</li>
          <li>
            Salvar seus personagens e arquivos e disponibilizá-los em
            qualquer dispositivo.
          </li>
          <li>
            Executar o que você pede: gerar textos, imagens, vídeos e voz, e
            publicar ou agendar posts.
          </li>
          <li>Cobrar planos e créditos e controlar o saldo.</li>
          <li>Prevenir abuso e fraude e aplicar limites de uso.</li>
          <li>
            Responder a pedidos de suporte e cumprir obrigações legais.
          </li>
        </ul>
        <p>
          As bases legais são a execução do contrato com você, o cumprimento
          de obrigações legais, o legítimo interesse em manter o serviço
          seguro e, quando aplicável, o seu consentimento.
        </p>
      </Secao>

      <Secao titulo="4. Dados recebidos do Google">
        <p>
          Usamos o nome, o e-mail e a foto recebidos do Google exclusivamente
          para criar e identificar sua conta, exibir seu perfil no app e
          falar com você sobre o serviço. Não vendemos esses dados, não os
          usamos para publicidade e não os usamos para treinar modelos de
          inteligência artificial. O uso segue a Política de Dados do Usuário
          dos Serviços de API do Google, incluindo os requisitos de Uso
          Limitado.
        </p>
      </Secao>

      <Secao titulo="5. Com quem compartilhamos">
        <p>
          Não vendemos dados pessoais. Compartilhamos apenas o necessário com
          os fornecedores que operam partes do serviço:
        </p>
        <ul>
          <li>
            <strong>Hospedagem e banco de dados:</strong> Vercel e Neon.
          </li>
          <li>
            <strong>Armazenamento de arquivos:</strong> Amazon Web Services
            (S3).
          </li>
          <li>
            <strong>Login:</strong> Google.
          </li>
          <li>
            <strong>Geração com IA:</strong> Anthropic, Google (Gemini),
            fal.ai, Runway e ElevenLabs recebem o conteúdo que você envia
            para gerar (textos, imagens, vídeos e áudios).
          </li>
          <li>
            <strong>Importação de vídeo por link:</strong> Apify.
          </li>
          <li>
            <strong>Publicação nas redes:</strong> bundle.social e as redes
            sociais que você conectar.
          </li>
          <li>
            <strong>Pagamentos:</strong> Stripe e, em pagamentos com USDC, as
            redes blockchain utilizadas.
          </li>
        </ul>
        <p>
          Esses fornecedores podem tratar dados fora do Brasil. Também
          podemos divulgar dados quando exigido por lei ou por ordem de
          autoridade competente.
        </p>
      </Secao>

      <Secao titulo="6. Imagem e voz de pessoas reais">
        <p>
          Imagens, vídeos e amostras de voz podem conter dados de pessoas
          reais. Antes de treinar um personagem, clonar uma voz ou usar um
          vídeo de terceiros, pedimos que você declare que o material é de um
          personagem sintético ou que você tem autorização para usá-lo.
          Guardamos o registro dessa declaração. Se você acredita que sua
          imagem ou voz foi usada sem autorização, escreva para{" "}
          <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </Secao>

      <Secao titulo="7. Cookies e armazenamento no navegador">
        <p>
          Usamos cookies estritamente necessários para manter você
          conectado. Também usamos o armazenamento do próprio navegador para
          guardar personagens e preferências, como o idioma. Não usamos
          cookies de publicidade.
        </p>
      </Secao>

      <Secao titulo="8. Por quanto tempo guardamos">
        <p>
          Mantemos os dados enquanto sua conta estiver ativa. Arquivos que
          deixam de estar ligados a um personagem são removidos
          periodicamente. Depois de um pedido de exclusão, apagamos os dados
          da conta, exceto os que precisamos manter por obrigação legal, como
          registros de pagamento.
        </p>
      </Secao>

      <Secao titulo="9. Segurança">
        <p>
          O tráfego é criptografado (HTTPS), os arquivos ficam em
          armazenamento privado com acesso por links temporários e o acesso
          aos dados é restrito ao necessário para operar o serviço. Nenhum
          sistema é totalmente imune a falhas; se houver um incidente
          relevante envolvendo seus dados, você será avisado.
        </p>
      </Secao>

      <Secao titulo="10. Seus direitos">
        <p>
          Você pode pedir, a qualquer momento, confirmação do tratamento,
          acesso, correção, portabilidade, anonimização ou exclusão dos seus
          dados, além de revogar consentimentos. Você pode excluir
          personagens direto no app; para excluir a conta inteira ou exercer
          os demais direitos, escreva para{" "}
          <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>. Você também
          pode revogar o acesso do NIDO Studio nas configurações da sua conta
          Google e reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </Secao>

      <Secao titulo="11. Menores de idade">
        <p>
          O serviço é destinado a maiores de 18 anos. Não coletamos
          intencionalmente dados de menores.
        </p>
      </Secao>

      <Secao titulo="12. Mudanças nesta política">
        <p>
          Podemos atualizar esta política. A data no topo indica a versão em
          vigor, e mudanças relevantes serão comunicadas no app ou por
          e-mail. Veja também os{" "}
          <Link href="/termos">Termos de Serviço</Link>.
        </p>
      </Secao>
    </>
  );
}

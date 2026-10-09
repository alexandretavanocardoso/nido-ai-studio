import Link from "next/link";
import { EMAIL_CONTATO, Secao } from "@/components/legal/Secao";

export function TermosPt() {
  return (
    <>
      <Secao titulo="1. Aceitação">
        <p>
          Estes termos regulam o uso do <strong>NIDO Studio</strong>{" "}
          (&quot;NIDO&quot;, &quot;serviço&quot;), disponível em{" "}
          <a href="https://aistudio.nido.global">aistudio.nido.global</a>. Ao
          criar uma conta ou usar o serviço, você concorda com eles e com a{" "}
          <Link href="/privacidade">Política de Privacidade</Link>. Se não
          concordar, não use o serviço.
        </p>
      </Secao>

      <Secao titulo="2. O serviço">
        <p>
          O NIDO Studio permite criar influenciadores sintéticos: definir a
          ficha do personagem, gerar textos, imagens, vídeos e voz com
          inteligência artificial e publicar ou agendar posts nas redes
          sociais. Parte dos recursos depende de serviços de terceiros e pode
          mudar, ficar indisponível ou ser descontinuada.
        </p>
      </Secao>

      <Secao titulo="3. Conta">
        <ul>
          <li>Você precisa ter pelo menos 18 anos.</li>
          <li>
            O login é feito com sua conta Google. Você é responsável por
            manter essa conta segura e por tudo o que for feito a partir
            dela.
          </li>
          <li>
            Sem login, o app funciona em modo local e os dados ficam apenas
            no seu navegador; nesse modo não há cópia de segurança.
          </li>
        </ul>
      </Secao>

      <Secao titulo="4. Seu conteúdo">
        <p>
          O que você envia e o que você gera no serviço continua sendo seu,
          na medida permitida pela lei e pelos termos dos provedores de IA
          utilizados. Você nos autoriza a armazenar, processar e transmitir
          esse conteúdo apenas para prestar o serviço a você — por exemplo,
          enviá-lo aos provedores de IA para gerar um resultado ou à rede
          social em que você pediu a publicação.
        </p>
        <p>
          Você declara que tem os direitos necessários sobre tudo o que
          envia, incluindo imagens, vídeos e vozes de pessoas reais.
        </p>
      </Secao>

      <Secao titulo="5. Uso aceitável">
        <p>Você concorda em não usar o serviço para:</p>
        <ul>
          <li>
            usar a imagem, a voz ou a identidade de uma pessoa real sem a
            autorização dela;
          </li>
          <li>
            se passar por outra pessoa ou enganar o público sobre quem está
            falando;
          </li>
          <li>
            criar conteúdo sexual envolvendo menores, conteúdo íntimo sem
            consentimento, assédio, discurso de ódio ou incitação à
            violência;
          </li>
          <li>praticar fraude, golpes ou desinformação deliberada;</li>
          <li>violar direitos autorais, marcas ou outros direitos de terceiros;</li>
          <li>
            burlar limites técnicos, revender o acesso ou comprometer a
            segurança do serviço;
          </li>
          <li>
            descumprir as regras das redes sociais em que você publica ou dos
            provedores de IA utilizados.
          </li>
        </ul>
        <p>
          Ao treinar um personagem, clonar uma voz ou importar um vídeo, o
          app pede uma declaração de que você tem autorização para usar o
          material. Essa declaração fica registrada.
        </p>
      </Secao>

      <Secao titulo="6. Conteúdo sintético">
        <p>
          O conteúdo é gerado por inteligência artificial e pode conter
          erros, imprecisões ou semelhanças não intencionais com pessoas e
          obras existentes. Você é responsável por revisar o que publica, por
          sinalizar que o personagem é sintético quando a lei ou a rede
          social exigir e pelo uso que fizer dos resultados.
        </p>
      </Secao>

      <Secao titulo="7. Planos, créditos e pagamentos">
        <ul>
          <li>
            Os recursos de IA consomem créditos. Os preços, os créditos de
            cada plano e o custo de cada ação estão na página{" "}
            <Link href="/app/planos">Planos</Link>.
          </li>
          <li>
            Planos pagos são assinaturas renovadas automaticamente até o
            cancelamento, que pode ser feito a qualquer momento e vale a
            partir do fim do período já pago.
          </li>
          <li>
            Créditos do plano e pacotes avulsos têm prazo de validade,
            indicado na página de Planos. Créditos não são dinheiro, não
            podem ser transferidos nem convertidos em valores.
          </li>
          <li>
            Os pagamentos são processados por terceiros (Stripe) ou feitos em
            USDC nas redes indicadas. Transações em blockchain são
            irreversíveis: confira a rede e o endereço antes de enviar.
          </li>
          <li>
            Reembolso: você pode pedir o valor de volta em até 7 dias depois
            da compra, desde que nenhum crédito dela tenha sido usado. Usou
            qualquer crédito da compra (mesmo um só), não há mais reembolso.
            Gerações que falharam e tiveram os créditos devolvidos não contam
            como uso. Escreva para{" "}
            <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
          </li>
          <li>
            Podemos alterar preços e planos; mudanças valem para os períodos
            seguintes e são comunicadas com antecedência.
          </li>
        </ul>
      </Secao>

      <Secao titulo="8. Redes sociais e serviços de terceiros">
        <p>
          Ao conectar uma rede social, você nos autoriza a publicar em seu
          nome o que você agendar. Cada rede e cada provedor tem regras
          próprias, e não respondemos por bloqueios, remoções de conteúdo,
          mudanças ou indisponibilidade desses serviços.
        </p>
      </Secao>

      <Secao titulo="9. Suspensão e encerramento">
        <p>
          Você pode parar de usar o serviço e pedir a exclusão da conta a
          qualquer momento. Podemos suspender ou encerrar contas que violem
          estes termos, representem risco a terceiros ou ao serviço, ou
          quando exigido por lei.
        </p>
      </Secao>

      <Secao titulo="10. Propriedade intelectual do serviço">
        <p>
          O software, a marca e o design do NIDO Studio pertencem ao NIDO.
          Estes termos não transferem a você nenhum direito sobre eles além
          do uso do serviço.
        </p>
      </Secao>

      <Secao titulo="11. Garantias e responsabilidade">
        <p>
          O serviço é oferecido no estado em que se encontra, sem garantia de
          disponibilidade contínua nem de que os resultados atenderão a um
          objetivo específico. Na extensão permitida pela lei, o NIDO não
          responde por danos indiretos, lucros cessantes ou perda de dados
          decorrentes do uso do serviço. Nada nestes termos afasta direitos
          que a legislação de defesa do consumidor garante a você.
        </p>
      </Secao>

      <Secao titulo="12. Mudanças nestes termos">
        <p>
          Podemos atualizar estes termos. A data no topo indica a versão em
          vigor, e mudanças relevantes serão comunicadas no app ou por
          e-mail. Continuar usando o serviço depois da mudança significa que
          você concorda com a nova versão.
        </p>
      </Secao>

      <Secao titulo="13. Lei aplicável e contato">
        <p>
          Estes termos são regidos pelas leis do Brasil. Dúvidas:{" "}
          <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </Secao>
    </>
  );
}

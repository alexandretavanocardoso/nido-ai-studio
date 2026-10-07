import Link from "next/link";
import { EMAIL_CONTATO, Secao } from "@/components/legal/Secao";

export function PrivacidadeEn() {
  return (
    <>
      <Secao titulo="1. Who we are">
        <p>
          <strong>NIDO Studio</strong> (&quot;NIDO&quot;, &quot;we&quot;) is a
          tool for creating and managing synthetic influencers: character
          sheet, images, videos, voice and publishing to social networks. The
          service is available at{" "}
          <a href="https://aistudio.nido.global">aistudio.nido.global</a>.
        </p>
        <p>
          This policy explains which personal data we process, why, and what
          your rights are, in accordance with the Brazilian General Data
          Protection Law (Law No. 13,709/2018 — LGPD). Questions and
          requests: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
        <p>
          This is a translation of the Portuguese version. If the two differ,
          the Portuguese version prevails.
        </p>
      </Secao>

      <Secao titulo="2. Data we collect">
        <ul>
          <li>
            <strong>Google account data.</strong> When you sign in with
            Google, we receive your name, email address and profile picture.
            We do not receive your password and have no access to your Gmail,
            Drive, contacts or any other data in your Google account.
          </li>
          <li>
            <strong>Content you create or upload.</strong> Character sheets,
            texts, images, videos, audio and voice samples, video links you
            paste and posts you schedule.
          </li>
          <li>
            <strong>Connected social accounts.</strong> When you connect a
            network to publish, we store the identifier of that connection
            and your post history. Access credentials are held by the
            publishing provider, not by us.
          </li>
          <li>
            <strong>Payments.</strong> Subscribed plan, credit purchases,
            amounts, dates and status. Card data is handled directly by the
            payment processor; we do not store it. For USDC payments, we
            record the network and the corresponding transaction, which are
            public on the blockchain.
          </li>
          <li>
            <strong>Service usage.</strong> Credit balance and movements,
            usage counters and limits, authorization statements you accept,
            and technical logs (date, time, IP address and errors) needed to
            operate and protect the service.
          </li>
        </ul>
        <p>
          Without signing in, the app works in local mode: characters are
          saved only in your browser and are not sent to our servers until
          you create an account.
        </p>
      </Secao>

      <Secao titulo="3. How we use the data">
        <ul>
          <li>To authenticate you and keep you signed in.</li>
          <li>
            To save your characters and files and make them available on any
            device.
          </li>
          <li>
            To do what you ask: generate texts, images, videos and voice, and
            publish or schedule posts.
          </li>
          <li>To bill plans and credits and keep track of your balance.</li>
          <li>To prevent abuse and fraud and enforce usage limits.</li>
          <li>To answer support requests and comply with legal obligations.</li>
        </ul>
        <p>
          The legal bases are the performance of our contract with you,
          compliance with legal obligations, our legitimate interest in
          keeping the service secure and, where applicable, your consent.
        </p>
      </Secao>

      <Secao titulo="4. Data received from Google">
        <p>
          We use the name, email and picture received from Google solely to
          create and identify your account, show your profile in the app and
          contact you about the service. We do not sell this data, do not use
          it for advertising and do not use it to train artificial
          intelligence models. Our use complies with the Google API Services
          User Data Policy, including the Limited Use requirements.
        </p>
      </Secao>

      <Secao titulo="5. Who we share it with">
        <p>
          We do not sell personal data. We share only what is necessary with
          the providers that run parts of the service:
        </p>
        <ul>
          <li>
            <strong>Hosting and database:</strong> Vercel and Neon.
          </li>
          <li>
            <strong>File storage:</strong> Amazon Web Services (S3).
          </li>
          <li>
            <strong>Sign-in:</strong> Google.
          </li>
          <li>
            <strong>AI generation:</strong> Anthropic, Google (Gemini),
            fal.ai, Runway and ElevenLabs receive the content you submit for
            generation (texts, images, videos and audio).
          </li>
          <li>
            <strong>Importing video by link:</strong> Apify.
          </li>
          <li>
            <strong>Publishing to social networks:</strong> bundle.social and
            the social networks you connect.
          </li>
          <li>
            <strong>Payments:</strong> Stripe and, for USDC payments, the
            blockchain networks used.
          </li>
        </ul>
        <p>
          These providers may process data outside Brazil. We may also
          disclose data when required by law or by order of a competent
          authority.
        </p>
      </Secao>

      <Secao titulo="6. Image and voice of real people">
        <p>
          Images, videos and voice samples may contain data about real
          people. Before training a character, cloning a voice or using a
          third-party video, we ask you to state that the material belongs to
          a synthetic character or that you are authorized to use it. We keep
          a record of that statement. If you believe your image or voice was
          used without authorization, write to{" "}
          <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </Secao>

      <Secao titulo="7. Cookies and browser storage">
        <p>
          We use strictly necessary cookies to keep you signed in. We also
          use your browser&apos;s own storage to keep characters and
          preferences, such as language. We do not use advertising cookies.
        </p>
      </Secao>

      <Secao titulo="8. How long we keep it">
        <p>
          We keep data for as long as your account is active. Files that are
          no longer linked to a character are removed periodically. After a
          deletion request, we erase the account data, except what we must
          keep by legal obligation, such as payment records.
        </p>
      </Secao>

      <Secao titulo="9. Security">
        <p>
          Traffic is encrypted (HTTPS), files are kept in private storage
          accessed through temporary links, and access to data is restricted
          to what is needed to operate the service. No system is completely
          immune to failure; if a relevant incident involving your data
          occurs, you will be notified.
        </p>
      </Secao>

      <Secao titulo="10. Your rights">
        <p>
          At any time you may request confirmation of processing, access,
          correction, portability, anonymization or deletion of your data,
          and withdraw consent. You can delete characters directly in the
          app; to delete your whole account or exercise the other rights,
          write to <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
          You can also revoke NIDO Studio&apos;s access in your Google
          account settings and file a complaint with the Brazilian National
          Data Protection Authority (ANPD).
        </p>
      </Secao>

      <Secao titulo="11. Minors">
        <p>
          The service is intended for people aged 18 or over. We do not
          knowingly collect data from minors.
        </p>
      </Secao>

      <Secao titulo="12. Changes to this policy">
        <p>
          We may update this policy. The date at the top shows the version
          in force, and relevant changes will be announced in the app or by
          email. See also the <Link href="/termos">Terms of Service</Link>.
        </p>
      </Secao>
    </>
  );
}

# Deploy em produção — aistudio.nido.global

Checklist para colocar o NIDO Studio no ar em **https://aistudio.nido.global** (Vercel).
O `.env` local continua com `http://localhost:3000` para desenvolver; os valores abaixo são os de **produção**.

---

## 1. Vercel

1. Importe o repositório na Vercel (framework: Next.js).
2. **Settings → Domains**: adicione `aistudio.nido.global` e crie no DNS do `nido.global` o registro que a Vercel indicar (CNAME `aistudio` → `cname.vercel-dns.com`).
3. **Settings → Environment Variables** (Production) — copie do `.env` local, trocando só o que está marcado:

| Variável | Valor em produção |
|---|---|
| `BETTER_AUTH_URL` | **`https://aistudio.nido.global`** (troque o localhost) |
| `BETTER_AUTH_SECRET` | o mesmo do `.env` (ou um novo: `openssl rand -base64 32`) |
| `DATABASE_URL` | Neon (mesmo do `.env`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | mesmos do `.env` |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` · `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` · `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | opcionais — contas vinculadas no Perfil (passo 2); cada rede só aparece com o par preenchido |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | mesmos do `.env` |
| `CRON_SECRET` | mesmo do `.env` |
| `GEMINI_API_KEY` | mesmo do `.env` |
| `FAL_KEY` | mesmo do `.env` |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_WORKSPACE_ID` se a chave não for de um workspace) | do `.env` |
| `ELEVENLABS_API_KEY` | do `.env` |
| `APIFY_TOKEN` (ou `APIFY_API_TOKEN`) | do `.env` |
| `BUNDLE_SOCIAL` | do `.env` |
| `BUNDLE_SOCIAL_WEBHOOK_SECRET` | segredo do webhook do bundle.social (passo 4) |
| `RUNWAYML_API_SECRET` | quando tiver (Criar vídeo) |
| `SAPIENS_KEY` | opcional (Criar vídeo: Kling V3 e Veo mais barato) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | quando tiver (passo 5) |
| `SOLANA_MERCHANT_WALLET`, `SOLANA_RPC_URL` | do `.env` (RPC sem restrição de origem) |
| `EVM_MERCHANT_WALLET`, `BASE_RPC_URL`, `ARBITRUM_RPC_URL`, `BSC_RPC_URL`, `ETHEREUM_RPC_URL` | do `.env` — USDC nas redes EVM; cada rede só aparece com o RPC preenchido (RPC sem allowlist de origem) |

Opcionais (têm padrão): `ANTHROPIC_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL_PRO`, `GEMINI_TEXT_MODEL`, `ELEVENLABS_MODEL`, `APIFY_ACTOR_*`, `VIDEO_MAX_SECONDS`, `VIDEO_DAILY_SECONDS`, `RATE_LIMIT_PER_MINUTE`, `IMAGE_RATE_LIMIT_PER_MINUTE`, `IMAGE_DAILY_LIMIT`, `SOLANA_USDC_MINT`.

4. **Deploy**. As migrations já estão aplicadas no Neon (0001 a 0013).

> Com o `BETTER_AUTH_URL` público, o fal.ai passa a avisar o app quando cada vídeo termina (webhook assinado): trocas de pessoa e treinos terminam mesmo com a página fechada.

---

## 2. Google (login)

[Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials** → o OAuth client Web do app:

- **Authorized JavaScript origins:** `https://aistudio.nido.global`
- **Authorized redirect URIs:** `https://aistudio.nido.global/api/auth/callback/google`

Mantenha também os de `http://localhost:3000` para desenvolver.

### Contas vinculadas no Perfil (Discord, LinkedIn, X)

Opcionais. Não são login: a pessoa entra pelo Google e, em **Conta → Perfil**, liga as outras contas. Cada rede precisa de um app próprio, com o endereço de retorno cadastrado:

| Rede | Onde criar o app | Endereço de retorno |
|---|---|---|
| Discord | [discord.com/developers](https://discord.com/developers/applications) → OAuth2 | `https://aistudio.nido.global/api/auth/callback/discord` |
| LinkedIn | [linkedin.com/developers](https://www.linkedin.com/developers/apps) → Products: **Sign In with LinkedIn using OpenID Connect** → Auth | `https://aistudio.nido.global/api/auth/callback/linkedin` |
| X | [developer.x.com](https://developer.x.com/) → app → **User authentication settings**: OAuth 2.0, tipo **Web App**, permissão **Read** | `https://aistudio.nido.global/api/auth/callback/twitter` |

No X, as chaves são o **Client ID** e o **Client Secret** do OAuth 2.0 (não a API Key). O app pede só a identificação da conta (`users.read`, `tweet.read`, `offline.access`), sem e-mail.

---

## 3. AWS S3 (CORS do bucket)

Bucket → **Permissions → CORS**:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://aistudio.nido.global"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## 4. bundle.social (publicar nas redes)

Painel do [bundle.social](https://bundle.social) → **Webhooks** → novo webhook:

- **URL:** `https://aistudio.nido.global/api/social/webhook`
- **Evento:** `post.published`
- Copie o **segredo de assinatura** para `BUNDLE_SOCIAL_WEBHOOK_SECRET` na Vercel.

Plano: o Free permite 20 posts/mês e 3 contas conectadas; para clientes, o Pro (US$ 100/mês, 10 mil posts, contas ilimitadas).

**Instagram:** só publica com conta **profissional** (Comercial ou Criador de conteúdo) **ligada a uma página do Facebook** — exigência da Meta. O app avisa isso na tela de Publicar.

---

## 5. Stripe (cartão, Pix e boleto)

Situação em **07/10/2026**: webhook e produtos já criados na conta de produção; a conta ainda **não está ativada** (o Stripe recusa qualquer checkout com "No valid payment method types"). Tudo abaixo é feito no Dashboard, em modo produção.

**Já feito**

- [x] Destino de webhook `https://aistudio.nido.global/api/pagamentos/stripe/webhook`, escopo "Sua conta", payload "Instantâneo", com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`.
- [x] Catálogo: 7 produtos e 10 preços (BRL e USD no mesmo preço), achados pelo app pela lookup key — `plano_{starter|creator|studio}_{mensal|anual}`, `pacote_{p500|p1500|p5000}`, `creditos_avulso`. Os valores de [lib/planos.ts](lib/planos.ts) mandam: se um preço mudar lá, crie um preço novo no Stripe com a mesma lookup key (marcando "transferir lookup key") e arquive o antigo; enquanto estiverem diferentes, o app monta o preço na hora.

**Falta fazer, nesta ordem**

1. [ ] **Ativar a conta.** Clicar em **Ativar pagamentos** e preencher até o fim: dados da empresa (CNPJ ou CPF, endereço, ramo, site `https://aistudio.nido.global`), representante legal (nome, CPF, nascimento, documento), conta bancária para os repasses (mesmo CNPJ/CPF) e o nome que sai na fatura do cartão (ex.: `NIDO STUDIO`). Pronto quando o painel mostrar pagamentos e repasses ativos; a análise pode levar de minutos a alguns dias.
2. [ ] **Formas de pagamento** (Configurações → Pagamentos → Formas de pagamento): conferir **cartões** e ativar **boleto** e **Pix**. Se o Pix aparecer como "solicitar acesso", pedir e aguardar. O app não fixa as formas no código: o checkout mostra o que estiver ligado aqui. Pix e boleto só aparecem em compras em real e em pagamento único (plano anual, pacotes, créditos por quantidade); o plano mensal é assinatura no cartão.
3. [ ] **Portal do cliente** (Configurações → Faturamento → Portal do cliente): abrir e salvar a configuração, permitindo cancelar a assinatura e trocar o cartão. Sem salvar, o botão de gerenciar assinatura dá erro.
4. [ ] **Stripe Connect** (necessário para o saque das indicações — sem ele "Conectar Stripe" falha):
   - No menu **Connect**, clicar em começar e concluir o perfil da plataforma (o Stripe pergunta o modelo de negócio e quem responde por perdas).
   - Escolher contas **Express** e ligar a função **Transferências** (*transfers*). O app cria a conta Express de cada indicador pedindo só essa função e paga com uma transferência do saldo da plataforma.
   - Em Connect → Configurações → Marca, pôr nome, logo e cor — aparecem na tela de cadastro que o indicador vê.
   - Não precisa de outro webhook: o app consulta a conta do indicador na hora do saque.
   - O saque sai do **saldo disponível** da plataforma na moeda da comissão. Com o saldo ainda pendente (vendas recentes) ou sem saldo em dólar, a transferência falha e a comissão volta para "disponível".
   - Antes, rodar a migration `db/migrations/0016_indicacoes.sql` no Neon.
5. [ ] **Chaves na Vercel** (Settings → Environment Variables, ambiente Production): `STRIPE_SECRET_KEY` (`sk_live_...`) e `STRIPE_WEBHOOK_SECRET` (o `whsec_...` do destino acima). Depois, **redeploy**.
6. [ ] **Testar com compras reais** do menor pacote (500 créditos), reembolsando depois pelo painel:
   - cartão → o saldo sobe na hora;
   - Pix → sobe logo após pagar o QR code;
   - boleto → sobe só quando compensar (1 a 2 dias úteis);
   - plano mensal no cartão → o plano ativa; cancelar pelo portal;
   - site em inglês → conferir se o checkout abre em US$ (não confirmado para conta brasileira);
   - indicação → conectar o Stripe em `/app/indicacoes`, gerar uma comissão e sacar.

   Se o saldo não subir, ver as entregas do destino de webhook: **400** = `whsec_` errado; **500 "Stripe não configurado."** = falta variável na Vercel ou o redeploy.

Reembolso feito pelo painel devolve o dinheiro, mas não tira os créditos do cliente nem desfaz a comissão do indicador.

---

## 6. Crons

O `vercel.json` já agenda, uma vez por dia:

- `/api/cron/storage-cleanup` — limpa arquivos órfãos do S3.
- `/api/cron/video-jobs` — finaliza vídeos pendentes (rede de segurança).
- `/api/cron/nft` — NFT do influencer: fecha mints em aberto, recalcula views e badges, grava badges e confere a rede contra o banco. Sem o NFT configurado, não faz nada. Para um mint incerto fechar em minutos com a página fechada, chame também do cron externo a cada 5 min (mesmo cabeçalho abaixo). A migration `db/migrations/0028_nft.sql` já está aplicada no Neon (10/10); o passo a passo das chaves e da coleção está no [TECNICO.md](TECNICO.md), seção "NFT do influencer".
- `/api/cron/fornecedores` — só às segundas: o agente procura fornecedores de IA novos (vídeo, imagem e voz, com prioridade para a China) para a aba **Fornecedores** do admin. Custa cerca de US$ 1 por semana na Anthropic (estimado). A migration `db/migrations/0035_fornecedores_ia.sql` já está aplicada no Neon (13/10).
- `/api/cron/noticias` — todo dia: dois agentes de notícias para a aba **Notícias** do admin, um para os concorrentes e outro para as IAs que o NIDO usa (a lista de quem é acompanhado fica em `lib/noticias/tipos.ts`). Leem o X pelo Grok (precisa de `XAI_API_KEY`; sem ela, só a web) e a web pelo Claude. Notícia com nota 9 ou 10 também vira aviso no sino dos admins. A migration `db/migrations/0036_noticias_admin.sql` já está aplicada no Neon (13/10).

O **Criar vídeo** (Runway) não tem webhook: para ele terminar em minutos com a página fechada, use o plano Pro da Vercel com `"schedule": "*/5 * * * *"` nesse cron, **ou** um cron externo grátis (ex.: [cron-job.org](https://cron-job.org)) chamando a cada 5 min:

```
GET https://aistudio.nido.global/api/cron/video-jobs
Authorization: Bearer <CRON_SECRET>
```

---

## 7. Conferir depois do deploy

- [ ] Login com Google em `https://aistudio.nido.global`.
- [ ] Gerar uma imagem e enviar um vídeo (S3 + CORS).
- [ ] Trocar pessoa num vídeo e fechar a página — o vídeo deve aparecer pronto ao voltar (webhook do fal).
- [ ] Estúdio → Publicar → conectar uma rede e publicar um post de teste (bundle.social + webhook).
- [ ] Comprar o menor pacote de créditos no Stripe (modo teste) e ver o saldo subir.
- [ ] Sugerir campo com IA (chave da Anthropic com workspace).

## Landing page

- [ ] Rodar a migration `db/migrations/0022_leads.sql` no Neon. Sem ela, os formulários da landing (whitelist e plano Agência) respondem "Não foi possível registrar agora".
- Os vídeos da landing ficam no S3 em `site/lp/` e são lidos por `/midia-lp/<nome>.mp4`. Para trocar um vídeo: pôr o original em `public/video_lp/` (pasta fora do git) e rodar `node --env-file=.env scripts/lp-midia.mjs`, que comprime, gera a capa em `public/lp/capas/` e envia.

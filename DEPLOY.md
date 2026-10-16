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
| `EVM_MERCHANT_WALLET` (+ `EVM_MERCHANT_WALLET_BNB` etc. quando a rede recebe em outra carteira), `BASE_RPC_URL`, `ARBITRUM_RPC_URL`, `BSC_RPC_URL`, `ETHEREUM_RPC_URL` | do `.env` — USDC nas redes EVM; cada rede só aparece com o RPC preenchido (RPC sem allowlist de origem) |

Opcionais (têm padrão): `ANTHROPIC_MODEL`, `GEMINI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL_PRO`, `GEMINI_TEXT_MODEL`, `GEMINI_TEXT_MODEL_PRO`, `ELEVENLABS_MODEL`, `APIFY_ACTOR_*`, `VIDEO_MAX_SECONDS`, `VIDEO_DAILY_SECONDS`, `RATE_LIMIT_PER_MINUTE`, `IMAGE_RATE_LIMIT_PER_MINUTE`, `IMAGE_DAILY_LIMIT`, `SOLANA_USDC_MINT`.

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

## 5. Stripe (cartão, em dólar)

O app cobra pelo Stripe **sempre em dólar (USD) e só no cartão** (inclui Apple Pay e Google Pay). Pix e boleto ficam de fora pelo código, mesmo que estejam ligados no Dashboard.

Situação em **15/10/2026**: conta nova **NIDO AI Studio** (`acct_1UQnzw2crtPOJaWX`, Pessoa Jurídica), **ativada** — a conta antiga (`acct_1UNaOfGspXNxJxVy`, pessoa física, nunca ativada) não é mais usada. Checkout em US$ só com cartão testado nessa conta para os cinco casos (plano mensal, plano anual, pacote, créditos por quantidade): abre com o valor certo. Tudo abaixo é no Dashboard, em modo produção, na conta nova.

**Já feito**

- [x] Conta ativada (dados da empresa, banco, extrato `NIDO AI STUDIO`); cartão ativo.
- [x] Destino de webhook `https://aistudio.nido.global/api/pagamentos/stripe/webhook`, escopo "Sua conta", payload "Instantâneo", versão `2026-09-30.endive` (a do SDK), com os 8 eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.
- [x] Catálogo em USD: 7 produtos e 10 preços, achados pelo app pela lookup key — `plano_{starter|creator|studio}_{mensal|anual}`, `pacote_{p500|p1500|p5000}`, `creditos_avulso` (por crédito; a quantidade vai no checkout). Os valores de [lib/planos.ts](lib/planos.ts) mandam: se um preço mudar lá, crie um preço novo no Stripe com a mesma lookup key (marcando "transferir lookup key") e arquive o antigo; enquanto estiverem diferentes, o app monta o preço na hora.
- [x] `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` da conta nova no `.env` local.

**Falta fazer, nesta ordem**

1. [ ] **Portal do cliente** (Configurações → Faturamento → Portal do cliente): abrir e salvar a configuração, permitindo cancelar a assinatura e trocar o cartão. Hoje não há nenhuma salva: o botão de gerenciar assinatura dá erro.
2. [ ] **Chaves na Vercel** (Settings → Environment Variables, ambiente Production): `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` **da conta nova** (os mesmos do `.env`). Depois, **deploy** do código atual (a cobrança só em US$ e no cartão ainda não foi publicada).
3. [ ] **Liberar no app:** o Stripe está "só admin" — Admin → aba **Em teste** → "Pagamento com cartão (Stripe)". Testar primeiro com a conta admin; liberar para todos quando o teste passar.
4. [ ] **Testar com compras reais** pela conta admin, reembolsando depois (pelo admin ou pelo painel do Stripe — o app desfaz a compra no reembolso):
   - créditos por quantidade, 100 créditos = US$ 3 → o saldo sobe na hora;
   - pacote de 500 créditos = US$ 15 → o saldo sobe na hora;
   - plano Starter mensal = US$ 18 → o plano ativa; cancelar pelo portal.

   Se o saldo não subir, ver as entregas do destino de webhook: **400** = `whsec_` errado; **500 "Stripe não configurado."** = falta variável na Vercel ou o redeploy.
5. [ ] **Stripe Connect** (só para o saque das indicações — sem ele "Conectar Stripe" falha), na conta nova:
   - No menu **Connect**, clicar em começar e concluir o perfil da plataforma (o Stripe pergunta o modelo de negócio e quem responde por perdas).
   - Escolher contas **Express** e ligar a função **Transferências** (*transfers*). O app cria a conta Express de cada indicador pedindo só essa função e paga com uma transferência do saldo da plataforma.
   - Em Connect → Configurações → Marca, pôr nome, logo e cor — aparecem na tela de cadastro que o indicador vê.
   - Não precisa de outro webhook: o app consulta a conta do indicador na hora do saque.
   - O saque pelo Stripe sai do **saldo disponível** da plataforma **em reais** (a conta brasileira só tem saldo em reais): o saldo em dólar do indicador é convertido pela cotação do dia. Com o saldo ainda pendente (vendas recentes), a transferência falha e a comissão volta para "disponível".
   - Tetos dos saques (Stripe e USDC, em dólar): `SAQUE_TETO` (padrão 200 por saque) e `SAQUE_TETO_DIA` (padrão 1.000 por dia, todos os usuários).

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
- [ ] Sombra → Vídeo com o modelo **Gemini Omni Flash** (usa a `GEMINI_API_KEY` que já está na Vercel; precisa de faturamento ativo): um vídeo de ~20s, para conferir a troca, as emendas entre os trechos de 10s e o áudio original. Sem o relógio dos vídeos (worker do Motion), ele só termina com a página aberta ou no cron — o Omni não tem webhook.
- [ ] Estúdio → Publicar → conectar uma rede e publicar um post de teste (bundle.social + webhook).
- [ ] Comprar o menor pacote de créditos no Stripe (modo teste) e ver o saldo subir.
- [ ] Sugerir campo com IA (chave da Anthropic com workspace).

## Live do personagem (em teste: só admin)

- [x] A migration `db/migrations/0037_lives.sql` já está aplicada no Neon (14/10).
- [x] A migration `db/migrations/0038_lives_avulsa_transmissao.sql` já está aplicada no Neon (14/10).
- [x] A migration `db/migrations/0039_lives_cena.sql` já está aplicada no Neon (14/10).
- [x] A migration `db/migrations/0040_lives_sombra.sql` já está aplicada no Neon (14/10).
- [ ] Sombra (ao vivo e de vídeo gravado): `DECART_API_KEY` (platform.decart.ai) na Vercel.
- [ ] Sombra ao vivo, de verdade: entrar no ar com a webcam (Chrome ou Edge), conferir o influencer no palco, a voz própria e a trocada (boca e voz casando; ajustar "Sincronia da voz" se precisar) e a transmissão para uma rede.
- [x] A migration `db/migrations/0045_avatares_3d.sql` (Sombra 3D) já está aplicada no Neon (16/10).
- [ ] Sombra 3D: não precisa de chave nova (usa `GEMINI_API_KEY` e `FAL_KEY`). De verdade: preparar uma live com um personagem (o avatar leva 1 a 3 min), "Testar com a câmera" (cabeça, piscar, boca), entrar no ar e conferir o palco e a voz.
- [x] Sombra de vídeo gravado (lives longas, trechos, Twitch e Kick): **processo da Sombra** no ar no **Railway** (serviço `sombra`, 15/10) — — novo serviço a partir deste repositório com **Root Directory** `worker/sombra`, comando de início `npm start`, e as variáveis `DATABASE_URL`, `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DECART_API_KEY`, `ELEVENLABS_API_KEY`, `CRON_SECRET` (as mesmas do app) e `APP_URL=https://aistudio.nido.global`. Opcional: `SOMBRA_PARALELAS` (partes ao mesmo tempo, padrão 3). Uns US$ 5/mês. Para testar no computador: `cd worker/sombra && npm install && npx tsx --env-file=../../.env index.ts`.
- [ ] Decart com saldo: o Lucy em lote custa ~US$ 0,04 por segundo de vídeo (1 h ≈ US$ 144; 30 min ≈ US$ 72). Recarregar em platform.decart.ai antes de lives longas — sem saldo, o vídeo falha e os créditos do app voltam.
- [ ] Sombra de vídeo gravado, de verdade: colar o link de um VOD da Twitch e de um do Kick, escolher um trecho curto (ex.: 2 min) e conferir o resultado na Sombra; depois um MP4 enviado, com e sem troca de voz.
- [ ] Criar um projeto no LiveKit Cloud e pôr `LIVEKIT_URL` (wss://…), `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` na Vercel. Depois, **redeploy**.
- [ ] Chat do YouTube: no Google Cloud, ativar a "YouTube Data API v3" e criar uma chave de API; pôr em `YOUTUBE_API_KEY`.
- [ ] Chat do Kick: criar um app em kick.com → Settings → Developer, com o escopo `events:subscribe`, webhooks ligados e a URL `https://aistudio.nido.global/api/live/kick/webhook`; pôr `KICK_CLIENT_ID` e `KICK_CLIENT_SECRET`. O webhook só chega no domínio público (não funciona no localhost).
- [x] Bot do Discord (só voz): app **NIDO SINTÉTICO** (separado do app do login) e processo no ar no **Railway** (serviço `discord`, 15/10).
- [ ] Bot do Discord na Vercel: `DISCORD_BOT_TOKEN` e `DISCORD_BOT_CLIENT_ID` (o Application ID do app NIDO SINTÉTICO) + redeploy. Sem eles, a tela da Live não mostra o link para convidar o bot. Passos originais:
  1. Em discord.com/developers → Applications: crie um app (ou use o do login com Discord) → **Bot** → gere o token e ligue **Message Content Intent**.
  2. Na Vercel: `DISCORD_BOT_TOKEN` (e `DISCORD_BOT_CLIENT_ID` = Application ID, se o app não for o do login). Redeploy.
  3. Publique o processo do bot, que precisa ficar sempre ligado (a Vercel não serve): no **Railway**, novo serviço a partir deste repositório com **Root Directory** `worker/discord`, comando de início `npm start`, e as variáveis `DATABASE_URL`, `DISCORD_BOT_TOKEN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (as mesmas do app). Custa uns US$ 5/mês. Para testar no computador: `cd worker/discord && npm install && node --env-file=../../.env node_modules/tsx/dist/cli.mjs bot.ts`.
- Detalhes no [TECNICO.md](TECNICO.md), seção "Live do personagem".

## Vídeo de produto e Motion (em teste)

- [x] As migrations `db/migrations/0041_motion.sql` e `0043_motion_creditos.sql` (créditos do Motion) já estão aplicadas no Neon (15/10).
- [ ] Motion: cobra créditos (estimativa ao pedir, acerto pelo custo real quando fica pronto) e dá pontos. Testar uma geração e um ajuste conferindo o saldo; para liberar a todos: área admin → Em teste → Motion.
- [ ] Vídeo de produto (Estúdio → Produto): não precisa de nada novo — usa as chaves de vídeo (`SAPIENS_KEY`, `FAL_KEY`, `RUNWAYML_API_SECRET`), `ELEVENLABS_API_KEY`, `GEMINI_API_KEY` e `ANTHROPIC_API_KEY` que já estão na Vercel. Testar um com fala e um sem fala; para liberar a todos: área admin → Em teste → Vídeo de produto.
- [x] **Processo do Motion no Railway** (serviço `motion`, no ar em 15/10; gera a animação e grava o MP4; sem ele, os pedidos ficam na fila):
  1. No projeto do Railway: **New → GitHub Repo** → este repositório. Não precisa ser público: se ele não aparecer na lista, clique em **Configure GitHub App**, instale o app do Railway na conta dona do repositório (`alexandretavanocardoso`), libere o `nido-ai-studio` e volte em **Refresh**.
  2. No serviço criado → **Settings → Source → Root Directory**: `worker/motion`. O Railway acha o `Dockerfile` sozinho (imagem do Playwright, já com o Chrome). Não precisa de domínio público.
  3. **Variables**: `DATABASE_URL`, `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ANTHROPIC_API_KEY` (e `ANTHROPIC_WORKSPACE_ID`, se o app usa) — as mesmas da Vercel —, `GEMINI_API_KEY` (para o Gemini 4 Argon, chave paga), `OPENAI_API_KEY` (para o GPT-6.1 Sol), e `APP_URL=https://aistudio.nido.global` + `CRON_SECRET` (o mesmo da Vercel) para o **relógio dos vídeos**: a cada minuto o worker chama `/api/cron/video-jobs`, e os vídeos em cenas (produto, criar, falado, troca) terminam mesmo com o navegador fechado. No log: `relógio dos vídeos ligado`.
  4. Deploy. Nos logs aparece `[motion] ligado:`; na tela do Motion some o aviso "o worker não está ligado".
  5. Memória: o Chrome gravando em 1080p usa ~1 GB; o plano do Railway dá conta. Uns US$ 5–10/mês.
- [ ] Motion de verdade: um de produto (Opus 5.5, esforço alto, 15 s), um de site (Sonnet 5.5) e exportar o MP4 de um deles.
- Detalhes no [TECNICO.md](TECNICO.md), seções "Vídeo de produto" e "Motion".

## Landing page

- [x] A migration `db/migrations/0022_leads.sql` já está aplicada no Neon (conferido em 15/10).
- Os vídeos da landing ficam no S3 em `site/lp/` e são lidos por `/midia-lp/<nome>.mp4`. Para trocar um vídeo: pôr o original em `public/video_lp/` (pasta fora do git) e rodar `node --env-file=.env scripts/lp-midia.mjs`, que comprime, gera a capa em `public/lp/capas/` e envia.

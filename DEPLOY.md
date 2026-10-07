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

1. Conta Brasil → **Settings → Payment methods**: ativar **Pix** e **boleto**. Ativar o **Customer portal**.
2. **Developers → Webhooks** → novo endpoint:
   - **URL:** `https://aistudio.nido.global/api/pagamentos/stripe/webhook`
   - **Eventos:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted`
3. `STRIPE_SECRET_KEY` (chave secreta) e `STRIPE_WEBHOOK_SECRET` (segredo do endpoint) na Vercel.

---

## 6. Crons

O `vercel.json` já agenda, uma vez por dia:

- `/api/cron/storage-cleanup` — limpa arquivos órfãos do S3.
- `/api/cron/video-jobs` — finaliza vídeos pendentes (rede de segurança).

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

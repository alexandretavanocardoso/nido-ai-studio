# Crie seu Influenciador Sintético

> **Deploy em produção (aistudio.nigo.global):** passo a passo em [`DEPLOY.md`](DEPLOY.md) — variáveis da Vercel, Google, S3, bundle.social, Stripe e crons.

Wizard em etapas para definir, campo a campo, quem é o seu influenciador sintético. No final, entrega a **Ficha do Influenciador** completa (exportável em PNG, PDF e JSON) e o personagem pronto para gerar imagens, vídeos e textos dentro do app.

As features de IA (expansão por contexto, sugerir campo, regenerar seção, checar coerência) são **opcionais** — ficam escondidas por padrão. O wizard manual funciona 100% sem configurar nada.

> **v2.** Personagens vivem no `localStorage`. Quando a IA é ligada, a geração usa a API da Anthropic no server-side.

## Rodar localmente

> **Recursos por chave, sem "ENABLED":** cada integração (login, S3, IA, Gemini, fal.ai, Runway) aparece sozinha quando as chaves dela estão no `.env` — ver [`lib/recursos.ts`](lib/recursos.ts) e [`.env.example`](.env.example). Sem chaves, o app roda no modo manual, sem custo.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Pronto — o wizard manual já funciona.

Build e start de produção:

```bash
npm run build
npm run start
```

Checagem de tipos / testes:

```bash
npm run typecheck
npm test
```

## Como começar um personagem

Ao clicar em **Criar personagem**, o site pergunta como começar:

- **Criar manualmente** — wizard em branco.
- **Começar pela imagem** — gera a imagem do personagem e vai para a ficha.
- **Expandir com IA do site** — escreve uma ideia curta e a IA preenche a ficha (cada campo vem como "sugestão" para revisar; exige `ANTHROPIC_API_KEY`).

## Ligar login + banco (opcional)

Com o banco **Neon** (Postgres) e o login configurados, aparece o botão **Entrar** na top-nav e cada pessoa tem seus próprios personagens salvos no banco, acessíveis de qualquer dispositivo. O login é só com **Google**, via [Better Auth](https://www.better-auth.com/) rodando no próprio Next.js. Sem isso, o app continua funcionando no modo anônimo (localStorage no navegador).

Passo a passo:

1. Criar projeto grátis em [neon.tech](https://neon.tech) e copiar a connection string (**Dashboard → Connect**).
2. No **SQL Editor** do Neon: rodar, em ordem, [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql) (tabelas do Better Auth — `user`, `session`, `account`, `verification` — e `characters`), [`db/migrations/0002_rate_limits.sql`](db/migrations/0002_rate_limits.sql) (contadores de rate limit) e [`db/migrations/0003_video_jobs.sql`](db/migrations/0003_video_jobs.sql) (jobs de vídeo).
3. No [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**: criar um OAuth client **Web** com a redirect URI `http://localhost:3000/api/auth/callback/google` (e `https://aistudio.nigo.global/api/auth/callback/google` em produção).
4. Em `.env.local` (local) e na Vercel (produção):

```
DATABASE_URL=postgresql://usuario:senha@ep-xxx.neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=<string aleatória longa>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Para gerar o secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Como funciona a sincronização:**
- Sem login (anônimo): personagens só no `localStorage`.
- Ao entrar: os personagens do `localStorage` são anexados à conta e enviados ao banco, junto com os que já estavam lá.
- Enquanto logado: toda criação, edição e exclusão é espelhada no banco via `/api/characters` (só os personagens que mudaram).
- Ao sair: o navegador volta pro estado anônimo vazio; os dados continuam na conta.
- Não há Row-Level Security: o isolamento entre contas é feito no servidor — as rotas `/api/characters` sempre filtram pelo `user_id` da sessão.

## Ligar a IA (opcional)

Por padrão, nenhum botão de IA aparece — assim nenhum request vai pra Anthropic e não tem custo. Para habilitar as features de IA:

1. Copie `.env.example` para `.env.local` (ignorado pelo git).
2. Preencha `ANTHROPIC_API_KEY=sk-ant-...` (só server-side, nunca vai pro bundle).
3. Reinicie o `npm run dev`.

Com a flag desligada, os botões "Expandir com IA", "Sugerir com IA", "Regenerar esta seção" e "Checar com IA" ficam escondidos; o resto do app funciona normal. Com a flag ligada mas sem chave, os botões aparecem mas devolvem erro `CONFIG_MISSING` em pt-BR.

Variáveis adicionais:
- `ANTHROPIC_MODEL` — opcional. Default `claude-sonnet-5-5`.
- `RATE_LIMIT_PER_MINUTE` — opcional. Default `10` (janela de 1 min por IP; contador no Neon, ou em memória sem banco).

Deploy na Vercel: `Settings → Environment Variables` → adicione `ANTHROPIC_API_KEY` → Redeploy. Em branco, o deploy fica no modo manual, zero custo.

## Gerar imagens automaticamente (opcional)

Na etapa **Visual**, o painel "Gerar imagem com IA" pode gerar o card de referência e o retrato direto no site, com **Nano Banana** (API do Gemini), em vez de só copiar o prompt.

1. Crie uma chave em [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (com billing ativo — cada imagem é cobrada).
2. Em `.env.local` / Vercel: `GEMINI_API_KEY=...` (Nano Banana). Para os outros modelos: `FAL_KEY=...`.

Modelos (escolhidos na tela por rótulo de uso — `lib/ai/modelos-imagem.ts`):

| Rótulo na tela | Modelo | Serviço | Custo aprox. |
|---|---|---|---|
| Consistência do personagem (padrão) | Nano Banana 2 / Pro | Gemini (`GEMINI_API_KEY`) | ~US$ 0,04 / 0,15 |
| Foto realista em 4K, mais barato | Seedream 4.5 | fal.ai | ~US$ 0,04 |
| Editorial e moda | Flux.2 Pro | fal.ai | ~US$ 0,05 (US$ 0,03/MP) |
| Imagem com texto | GPT Image 2 | fal.ai | ~US$ 0,06 (média) / 0,20 (alta) |

Os modelos do fal aparecem quando `FAL_KEY` está preenchida. Com referências, usam o endpoint de edição (as imagens vão por URL pré-assinada do S3, ou pelo storage do fal no modo sem login); sem referências, o de texto. No GPT Image aparece o campo **Texto na imagem**, que abre exceção à regra "sem texto" do prompt.

Fluxo:
- **Estilo**: Realista (editorial fotográfico) ou 3D (render estilo animação). Vale para a geração e para o prompt Neutro.
- **Card de referência**: gerado a partir da ficha; opcionalmente com até 4 imagens de inspiração selecionadas.
- **Retrato**: selecione o card salvo nas referências — o retrato sai fiel a ele.
- **Qualidade**: Padrão (Nano Banana 2, 1K) ou Pro (Nano Banana Pro, 2K, mais caro).
- Resultado: baixar ou **salvar nas referências** (vira referência pro próximo passo).

Com login ligado, só contas logadas geram; teto de `IMAGE_RATE_LIMIT_PER_MINUTE` (padrão 5) por minuto e `IMAGE_DAILY_LIMIT` (padrão 30) por dia, por conta. Os contadores ficam na tabela `rate_limits` do Neon (migration `0002_rate_limits.sql`), então não zeram a cada deploy; sem banco, caem pra memória. Tentativas que falham também contam. O prompt é montado no servidor a partir da ficha (`lib/prompts/gerar-imagem.ts`), a chamada fica em `lib/ai/gemini.ts` e a imagem volta em JPEG.

## Armazenamento de arquivos (AWS S3, opcional)

Com o S3 ligado e a pessoa logada, imagens de referência, imagens geradas e vídeos vão para um **bucket privado**; o personagem guarda só a *key* do arquivo. Sem S3 (ou sem login), as imagens continuam em base64 no navegador, como antes.

Como funciona:
- **Envio**: o navegador pede uma URL pré-assinada (`POST /api/storage/upload`) e manda o arquivo direto pro S3 — não passa pela Vercel (limite de 4,5 MB).
- **Leitura**: `<img>`/`<video>` apontam para `/api/storage/file/<key>`, que confere se a key é da conta logada e redireciona para uma URL pré-assinada de 1h.
- **Organização**: `users/<id>/refs/`, `users/<id>/generated/`, `users/<id>/videos/`. O acesso é controlado pelo prefixo (`ownsKey`).
- Limites: imagens até 10 MB (JPEG/PNG/WebP); vídeos até 500 MB (MP4/MOV/WebM).
- **Galeria**: imagens geradas ficam em `character.geradas` (só a key; até 30 por personagem). Sem login, ficam só na sessão.
- **Migração**: ao entrar com S3 ligado, referências antigas em base64 são enviadas ao bucket em segundo plano (`StorageMigrator`) e saem do IndexedDB.
- **Limpeza**: cron diário (`/api/cron/storage-cleanup`, agendado em `vercel.json` às 07:00 UTC) apaga arquivos que nenhum personagem do dono referencia mais (incluindo o histórico do Desfazer) e que têm mais de 24h. Precisa de `CRON_SECRET` na Vercel.

Passo a passo na AWS:

1. **S3 → Create bucket**: nome único (ex.: `nido-influencer-arquivos`), região `sa-east-1` (São Paulo), **Block all public access ligado** (bucket privado).
2. No bucket → **Permissions → CORS**, cole (troque o domínio de produção):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://aistudio.nigo.global"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

3. **IAM → Users → Create user** (ex.: `nido-app`), sem acesso ao console. Em **Permissions → Add permissions → Create inline policy → JSON** (troque o nome do bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::nido-influencer-arquivos/users/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::nido-influencer-arquivos",
      "Condition": { "StringLike": { "s3:prefix": "users/*" } }
    }
  ]
}
```

4. No usuário → **Security credentials → Create access key** (caso de uso: "Application running outside AWS"). Copie a Access key e a Secret.
5. Em `.env.local` / Vercel:

```
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=nido-influencer-arquivos
```

O CORS com `GET` também é necessário para a exportação em PNG/PDF (html2canvas) conseguir desenhar as imagens do bucket.

## Vídeos: legenda e troca de pessoa (opcional)

No painel **"Substituir pessoa em vídeo"** (Revisão), com login + S3, a pessoa envia vídeos e, em cada um:

- **Legenda** — para legendas "queimadas" na imagem. Escolhe um quadro, arrasta um retângulo sobre a legenda e escolhe **Remover** (o `delogo` do ffmpeg reconstrói a área com os pixels vizinhos) ou **Trocar texto** (remove e escreve o novo texto centralizado, em Poppins Bold branca com contorno). Roda no servidor com o ffmpeg do pacote `ffmpeg-static`, sem custo externo, até 3 min de vídeo. Gera um vídeo novo; o original fica.
- **Trocar pessoa** — troca a pessoa pelo personagem mantendo movimento, câmera, cenário **e o áudio original** (música, fala). Dois motores, escolhidos na tela:
  - **Padrão · Kling O1 Edit** no fal.ai (`lib/video/troca.ts`) — US$ 0,126/s → 13 créditos/s, de 3s até o limite do plano (60s no Studio). A personagem vai **sem fundo** (recortada com BiRefNet e posta sobre branco — com fundo, o modelo copia o cenário da imagem). O Kling aceita 3–10s com lado menor ≥ 720px, então o vídeo vira **trechos iguais de até 10s** (ajustados para 720p+ e 24–60 fps) processados em paralelo; no fim os trechos são juntados e o **áudio original** volta por baixo. Testado: personagem 3D fiel, cenário e música mantidos. Dicas: personagem de **corpo inteiro** (meio corpo faz a IA inventar pernas/roupa, que podem variar entre trechos) e vídeo **sem cortes de cena**. Substituiu o Wan 2.2 Animate, que não trocava personagens 3D/estilizados.
  - **Premium · Seedance 2.5** (modo edição) no fal.ai — US$ 0,284/s em 720p → 29 créditos/s (gera no mínimo 4s), a partir do Creator. Aceita **até 30s de uma vez** (vídeos maiores viram partes de até 30s): no teste preservou melhor o cenário e os objetos (o Kling alterou o logo de um galão) e a roupa ficou coerente com o vídeo. Mesmo fluxo do Kling (personagem sem fundo, áudio original de volta). Substituiu o Runway Aleph, que custava o mesmo e exigia outra conta.
  - Nos dois motores dá para **remover legendas e textos da tela no mesmo passo** (vai no pedido à IA).
  Assíncrono: o app cria um job (`video_jobs`, com `provedor` fal/runway), consulta o serviço a cada 10s e, quando termina, salva o resultado no S3. Recomendado usar um **retrato de corpo inteiro** gerado na etapa Visual.
- **Criar vídeo** (Runway) — vídeo novo a partir da imagem do personagem (primeiro quadro) + texto da cena: **Gen-4 Turbo** (US$ 0,05/s, 5 ou 10s), **Gen-4.5** (US$ 0,12/s, 5 ou 10s) ou **Veo 3.1 Fast** (US$ 0,10/s, 0,15 com áudio; 4, 6 ou 8s). Vertical ou horizontal. O texto inicial vem da primeira ideia de conteúdo da ficha.

- **Legenda com IA** — para fundos complexos (o `delogo` deixa borrão): **Bria Video Eraser** (máscara) no fal.ai, US$ 0,14/s → 15 créditos/s, até 60s, a partir do Starter. O modelo aceita 5s, então o vídeo vira trechos de 4,8s processados em paralelo (`lib/video/legenda-ia.ts`); no fim os trechos limpos são juntados e **só a área da legenda** é aplicada sobre o original (resto da imagem e áudio intactos), com a legenda nova por cima no modo "trocar". Assíncrono, como a troca de pessoa.

Dá pra combinar: remover a legenda do original → trocar a pessoa → colocar legenda nova no resultado.

**Finalização com a página fechada** ([`lib/video/finalizar.ts`](lib/video/finalizar.ts)): os jobs de vídeo terminam por três caminhos, todos idempotentes (um "claim" no banco garante uma finalização só):
1. **Webhook do fal** (`POST /api/videos/webhook?job=…&t=…`, URL assinada com HMAC do `BETTER_AUTH_SECRET`). O corpo é ignorado — a finalização confere o estado na API do fal. Só é enviado quando `BETTER_AUTH_URL` é `https` público (em localhost não há como o fal chamar).
2. **Cron** `GET /api/cron/video-jobs` (com `CRON_SECRET`): varre os pendentes — cobre o **Runway, que não tem webhook**, e webhooks perdidos. Pendentes há mais de 48h viram erro com estorno.
3. **A tela**, a cada 10s, enquanto a página está aberta.

Ao finalizar, o vídeo é atualizado **dentro do personagem no banco** — aparece ao reabrir o app. Falhas devolvem os créditos e marcam o vídeo com erro.

> **Frequência do cron:** no plano Hobby a Vercel só permite cron diário (`vercel.json` está diário). Para o Runway terminar em minutos com a página fechada: plano Pro com `"schedule": "*/5 * * * *"`, ou um cron externo grátis (ex.: cron-job.org) chamando `GET https://aistudio.nigo.global/api/cron/video-jobs` a cada 5 min com o header `Authorization: Bearer $CRON_SECRET`.

Custos e limites:
- Troca: Kling O1 US$ 0,126/s (mínimo 3s); Seedance 2.5 US$ 0,284/s (mínimo 4s gerados). Criar vídeo (Runway) conforme o modelo acima. A tela mostra a estimativa antes de enviar (`lib/video/precos.ts`).
- `VIDEO_MAX_SECONDS` (padrão 60) por vídeo e `VIDEO_DAILY_SECONDS` (padrão 180) por conta/dia, contados no Neon. A duração é medida no servidor.

Para ligar a troca de pessoa:
1. Conta em [fal.ai](https://fal.ai) com créditos → **Dashboard → Keys** → criar chave.
2. `.env.local` / Vercel: `FAL_KEY=...`.
3. Rodar `db/migrations/0003_video_jobs.sql` e `0004_video_jobs_provedor.sql` no Neon.

Para ligar o Runway (Criar vídeo):
1. [dev.runwayml.com](https://dev.runwayml.com) → criar organização, adicionar créditos → **API Keys**.
2. `.env.local` / Vercel: `RUNWAYML_API_SECRET=...`.

Limitações conhecidas:
- A remoção de legenda por `delogo` deixa um leve borrão em fundos com muito detalhe. Remoção perfeita exigiria inpainting por IA (ex.: Wan VACE no fal), que hoje processa no máximo ~8s por vez.
- A legenda precisa estar sempre no mesmo lugar (legendas que mudam de posição exigem várias passadas).

## Persona treinada (opcional)

Um **modelo próprio por personagem** (LoRA) — o rosto sai idêntico em toda imagem e vídeo, sem depender de referência. Painel na etapa **Visual** (exige login, S3 e `FAL_KEY`; planos Creator e Studio).

1. **Conjunto de treino** — gerar 12/20/30 variações (ângulos, expressões, luzes) a partir do card/retrato (Nano Banana; Seedream se não houver Gemini; 5 créditos cada, as que falham são devolvidas) e/ou usar imagens da galeria. A pessoa aprova/descarta (mín. 9, ideal 15–30).
2. **Declaração obrigatória**: *"Declaro que estas imagens são de um personagem sintético ou de alguém que autorizou o uso da própria imagem."* — sem ela o treino não começa; fica registrada em `consentimentos` (conta, personagem, texto, IP, data).
3. **Treinar** — *Rápido* (FLUX LoRA Fast Training / FLUX.1, ~US$ 2, **250 créditos**; no Studio, 1 por mês incluso no plano) ou *Pro* (FLUX.2 [dev] Trainer, ~US$ 6,40, **650 créditos**). O ZIP leva cada imagem com a legenda `a photo of <gatilho>`; a palavra-gatilho é única (ex.: `lila_nd7k`). Treino assíncrono como os vídeos (webhook/cron/tela); o LoRA vai pro S3 da conta e o modelo fica em `personas_treino` (`alvo` = `flux1` ou `flux`) — a geração busca de lá, nunca do navegador. Vale o último treino pronto, de qualquer um dos dois. Falhou: créditos (ou o treino grátis do mês) voltam e a versão anterior continua valendo.
4. **Usar** — imagem: opção **"Persona treinada"** (5 créditos). Rápida: `fal-ai/flux-lora`, só pelo texto (~1 MP; as referências não entram). Pro: `fal-ai/flux-2/lora`, e `flux-2/lora/edit` com referências. Vídeo: gere a imagem com a persona e use-a como primeiro quadro em **Criar vídeo** (o treino de vídeo com Wan saiu — custava US$ 4,50 a mais por persona para o mesmo resultado prático).

## Voz do personagem (opcional)

Painel na etapa **Voz e Linguagem** (`ELEVENLABS_API_KEY`; a partir do Starter):
- **Pela descrição** (Voice Design): voz 100% sintética montada da ficha (gênero, idade, timbre, ritmo, sotaque) — 50 créditos.
- **Clonar amostra** (1 a 3 arquivos, 1–2 min de fala limpa) com **declaração obrigatória**: *"Declaro que esta voz é de um personagem sintético ou de alguém que autorizou o uso da própria voz."* — registrada em `consentimentos`.
- **Gerar fala** (português, `eleven_multilingual_v2`): MP3 no S3, ~3 créditos por 100 caracteres. As falas ficam na ficha.
- **Adicionar fala** a um vídeo (lista de vídeos): misturar com o áudio original ou substituir — gera um vídeo novo (ffmpeg, 2 créditos). Sem sincronia labial.
- As vozes ficam na conta ElevenLabs da NIDO; a tabela `vozes` garante que cada conta só usa as próprias.

## Trocar pessoa por link

Na lista de vídeos, **Colar link** (TikTok, Instagram reel/post, YouTube Shorts ou link direto de .mp4; até 3 min):
1. O servidor busca o arquivo do vídeo com o **Apify** (`APIFY_TOKEN`; actors configuráveis por `APIFY_ACTOR_*`), baixa numa pasta temporária, mede e deixa uma **cópia temporária no storage do fal** só pra IA ler — **o vídeo de origem não vai pro S3**. Custa 3 créditos (devolvidos se falhar). O link vale 24h (`links_video`).
2. Abre a troca de pessoa normal (Kling O1 ou Seedance 2.5) com a imagem do personagem, mais a **declaração obrigatória**: *"Declaro que tenho direito de usar este vídeo (sou o autor ou tenho autorização) e que vou sinalizar que o personagem é sintético."* — registrada em `consentimentos` com o link.
3. Só o **vídeo gerado** é salvo no S3 e entra na lista (com o link de origem guardado como referência).

## Publicar e agendar nas redes (bundle.social)

Estúdio → **Publicar** (`BUNDLE_SOCIAL`; a partir do Starter). Redes: **Instagram, TikTok, YouTube Shorts, X (Twitter) e LinkedIn**.

- **Contas por influencer:** cada influencer vira um *time* no bundle.social (`social_times`), com as contas sociais dele. "Conectar redes" abre o portal hospedado do bundle.social (OAuth de cada rede, escolha de página/canal, em português) e volta para o Estúdio.
- **Post:** mídia do personagem (vídeo pronto ou imagem gerada, enviada ao bundle.social por URL pré-assinada do S3), legenda (com "Escrever com IA"), título (YouTube) e as redes. **Publicar agora** ou **Agendar** (data/hora local → UTC). Validação por rede antes de enviar: X até 280 caracteres, YouTube só vídeo e com título, Instagram/TikTok/YouTube exigem mídia, LinkedIn exige texto.
- Tipos por rede: Instagram Reel (vídeo) ou Post (imagem), TikTok Vídeo/Imagem público, YouTube **Short**, X e LinkedIn com a mídia anexada. Todo post sai **marcado como conteúdo gerado por IA** onde a rede permite (`isAiGenerated` no Instagram/TikTok/X, `containsSyntheticMedia` no YouTube).
- **Acompanhamento:** posts em `posts_agendados` com o status do bundle.social (Agendado, Publicando, Em análise, Publicado com link, Falhou com o motivo por rede). Atualiza pelo **webhook** `POST /api/social/webhook` (`post.published`, assinatura em `BUNDLE_SOCIAL_WEBHOOK_SECRET`) e, sem webhook, ao abrir a tela (e a cada 30s enquanto publica). Posts agendados podem ser cancelados.
- **Custo:** 1 crédito por rede por post (o bundle.social cobra por post: Free 20/mês, Pro US$ 100 = 10 mil). `lib/social/{bundle,redes}.ts`, rotas em `app/api/social/*`.

## Planos, créditos e pagamentos

Com login configurado, toda geração com IA gasta **créditos** (1 crédito ≈ US$ 0,01 do custo nos serviços). O custo aparece no botão antes de gerar; se a geração falhar, os créditos voltam na hora (nos vídeos, quando o serviço reporta a falha). Sem login (modo dev), não há créditos — valem as cotas diárias fixas.

| | Grátis | Starter | Creator | Studio |
|---|---|---|---|---|
| Preço/mês (anual −20%) | — | R$ 79 · US$ 15 | R$ 199 · US$ 39 | R$ 499 · US$ 99 |
| Créditos/mês | 50 (uma vez) | 600 | 1.600 | 4.200 |
| Personagens | 1 | 3 | 10 | 30 |
| Imagem | NB Padrão, Seedream | + Flux.2, GPT média | todos, inclusive Pro | todos |
| Trocar pessoa (Kling O1) | — | até 15s | até 30s | até 60s |
| Troca Premium (Seedance 2.5) | — | — | ✓ | ✓ |
| Criar vídeo | — | Gen-4 Turbo | + Gen-4.5, Veo Fast | + Veo com áudio |
| Créditos que sobram | — | vencem | passam 1 mês | passam 1 mês |
| Gerações ao mesmo tempo (imagens / vídeos) | 1 / 1 | 1 / 1 | 2 / 2 | 4 / 3 |
| Armazenamento | 1 GB | 10 GB | 50 GB | 200 GB |

Pacotes avulsos (valem 12 meses, usados depois dos do plano): 500 cr (R$ 79 / US$ 15), 1.500 (R$ 219 / US$ 40), 5.000 (R$ 649 / US$ 120). **Outra quantidade** (compra manual): qualquer número inteiro de 100 a 100.000 créditos, a R$ 0,16 / US$ 0,03 por crédito (o preço do menor pacote — os pacotes continuam mais baratos; a tela sugere o pacote quando compensa), com as mesmas regras dos pacotes. Tudo isso vive em [`lib/planos.ts`](lib/planos.ts) — preços, cotas, permissões e o custo em créditos de cada ação.

Como funciona:
- **Saldo** em dois baldes (`creditos_conta`): do plano (recarrega todo mês; recarga "preguiçosa", na primeira leitura depois da data — vale pra assinatura e pro anual pré-pago) e avulsos. Débito atômico: plano primeiro, depois avulsos. Histórico completo em `creditos_mov`.
- **Cobrança** nas rotas: `cobrarOuResponder` (402 `SEM_CREDITOS` sem saldo) e `estornarSeHouver` no erro; bloqueios de plano devolvem 403 `PLANO`. Vídeos guardam a cobrança no job e estornam quando o serviço falha.
- **Personagens**: o limite do plano vale na criação (tela) e na sincronização (`/api/characters` recusa os novos além do limite).
- **Gerações simultâneas** ([`lib/limites.ts`](lib/limites.ts)): cada geração ocupa uma vaga (`geracoes_ativas`, expira sozinha em 10 min) e jobs de vídeo em processamento contam direto de `video_jobs`; um advisory lock por conta evita que dois cliques passem do limite. Acima do limite: 429 `SIMULTANEAS`. "Vídeo" inclui troca de pessoa, criar vídeo e legenda.
- **Armazenamento**: soma do tamanho dos arquivos da conta no S3 (listagem do bucket, cache de 10 min + soma a cada envio). Uploads e gerações que passariam da cota: 403 `ARMAZENAMENTO`. Arquivos removidos dos personagens são apagados pelo cron em até 24h, ou na hora pelo botão **Liberar espaço** (`POST /api/storage/liberar`, só a conta, folga de 30 min).
- **Stripe (BRL)**: plano mensal = assinatura no cartão (ativada/renovada a cada `invoice.paid`); anual e pacotes = pagamento único com cartão, Pix ou boleto (os métodos ligados no Dashboard). Portal do Stripe para cancelar/trocar cartão. Trocar de plano mensal cancela a assinatura anterior (sem pró-rata).
- **USDC (Solana, Base, Arbitrum, BNB Chain, Ethereum)**: o usuário escolhe a rede no modal e paga o preço exato (2 casas). Na Solana a confirmação é automática (Solana Pay, referência única). Nas EVM o QR é um link EIP-681 e, depois de pagar, o usuário cola o link/hash da transação: o servidor lê o recibo e confere destino (`EVM_MERCHANT_WALLET`), token USDC, valor, horário (depois da criação da cobrança, até 24h) e confirmações; cada transação paga uma cobrança só, e a carteira pagadora fica salva (`pagador`). Se o RPC do `.env` falhar, usa RPCs públicos de reserva. Na BNB Chain o USDC é o Binance-Peg (18 casas). Sempre pré-pago (mensal = 1 mês, anual, pacotes), **+5% de créditos**. O app gera link + QR com uma referência única; a tela consulta a cada 5s e o servidor confere na blockchain se a carteira da NIDO recebeu o valor em USDC. Cobrança expira em 24h.

Para ligar:
1. Rodar `db/migrations/0005_creditos.sql`, `0006_limites.sql` e `0007_persona_voz.sql` no Neon.
2. **Stripe**: conta Brasil, ativar Pix e boleto em *Settings → Payment methods*, ativar o *Customer portal*. `STRIPE_SECRET_KEY` + webhook em `https://aistudio.nigo.global/api/pagamentos/stripe/webhook` com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`. Local: `stripe listen --forward-to localhost:3000/api/pagamentos/stripe/webhook`.
3. **USDC**: `SOLANA_MERCHANT_WALLET` = endereço da carteira que recebe. Em produção, use um RPC dedicado (`SOLANA_RPC_URL`, ex.: Helius/QuickNode) — o público tem limite baixo. Para testar em devnet: RPC de devnet + `SOLANA_USDC_MINT` do USDC de teste.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 3** — tema claro, cream + verde, serif Fraunces + Inter + JetBrains Mono (design system do Treinadores de IA)
- **Zustand** + middleware `persist` → localStorage
- **@anthropic-ai/sdk** + **Zod** para as rotas de IA
- **@google/genai** (Nano Banana) + **sharp** para a geração de imagens — opcional
- **AWS S3** (`@aws-sdk/client-s3` + presigner) para arquivos — opcional
- **fal.ai** (`@fal-ai/client`, Kling O1 Edit, BiRefNet), **Runway** (`@runwayml/sdk`, Gen-4 / Veo) + **ffmpeg-static** para vídeo — opcionais
- **Neon** (Postgres, `@neondatabase/serverless`) + **Better Auth** (login Google) — opcionais
- **vitest** para testes
- **lucide-react**, **html2canvas**, **jspdf**

## Estrutura do projeto

```
app/
  layout.tsx                     tema + fonts
  page.tsx                       Landing page
  app/page.tsx                   Home — "Seus Personagens"
  app/personagem/[id]/page.tsx   Wizard
  auth/login/page.tsx            Login com Google
  api/
    auth/[...all]/route.ts       Better Auth (login Google, callback OAuth, sessão, logout)
    characters/route.ts          GET lista / PUT upsert dos personagens da conta logada
    characters/[id]/route.ts     DELETE de um personagem da conta logada
    gerar-imagem/route.ts        POST — gera card/retrato com Nano Banana (Gemini)
    storage/upload/route.ts      POST — URL pré-assinada para enviar arquivo ao S3
    storage/file/[...key]/route.ts GET — confere dono e redireciona para o arquivo no S3
    storage/liberar/route.ts     POST — apaga arquivos sem uso da conta e recalcula o espaço
    cron/storage-cleanup/route.ts  GET (cron) — apaga órfãos do S3 e contadores antigos
    videos/legenda/route.ts      POST — remove/troca legenda queimada (ffmpeg)
    videos/substituir/route.ts   POST — inicia troca de pessoa (Kling O1 ou Seedance 2.5 no fal.ai, em trechos) — job
    videos/criar/route.ts        POST — cria vídeo novo pelo Runway (Gen-4/Veo) — job
    videos/jobs/[id]/route.ts    GET — estado do job (finaliza se o serviço já terminou)
    videos/webhook/route.ts      POST — webhook do fal (URL assinada) → finaliza o job
    cron/video-jobs/route.ts     GET (cron) — finaliza jobs pendentes (Runway, webhooks perdidos)
    conta/creditos/route.ts      GET — plano, saldo e personagens da conta
    pagamentos/stripe/checkout   POST — abre o Checkout (assinatura mensal ou pagamento único)
    pagamentos/stripe/webhook    POST — eventos do Stripe (idempotente)
    pagamentos/stripe/portal     POST — portal do cliente (cancelar, cartão, faturas)
    pagamentos/usdc/route.ts     POST — cobrança USDC (link + QR; Solana Pay ou EIP-681)
    pagamentos/usdc/[id]         GET — confere o pagamento na blockchain
    persona/dataset/route.ts     POST — gera variações para o conjunto de treino
    persona/treinar/route.ts     POST — treina a persona (declaração obrigatória) — job
    persona/[characterId]        GET — situação do último treino e treinos grátis restantes no mês
    voz/criar/route.ts           POST — cria a voz (descrição ou clone com declaração)
    voz/falar/route.ts           POST — gera fala (MP3) com a voz do personagem
    voz/[characterId]            GET — vozes do personagem
    videos/audio/route.ts        POST — coloca uma fala num vídeo
  app/planos/page.tsx            página de planos, pacotes e tabela de custos
    expandir-ficha/route.ts      POST — contexto curto → sugestões para toda a ficha
    sugerir-campo/route.ts       POST — sugere valor para 1 campo específico
    regenerar-secao/route.ts     POST — regenera uma seção respeitando campos travados
    checar-consistencia/route.ts POST — editor crítico IA (contradições, clichês, genéricos)

components/
  home/                          CreateDialog (modal "Como começar?"), cards, empty state
  wizard/                        shell, tabs, header, footer, StatusBadge, SuggestionCounter,
                                 SuggestFieldButton, RegenerateSection, WizardContext
  preview/CharacterCard.tsx      pré-visualização ao vivo
  steps/                         7 arquivos (Identidade…Revisão)
  revisao/                       ConsistenciaIA, PontosEmAberto
  ui/                            Button, Input, Textarea, TagInput, CardChoice, Chip, Field,
                                 Slider, DicaBox
  export/FichaPoster.tsx         pôster vertical/horizontal da ficha
  auth/                          AuthProvider, AccountMenu, CharactersSyncer (sync com o banco)

lib/
  types.ts                       Character + metadados IA (_suggestions, _locks, _history)
  defaults.ts                    emptyCharacter + hydrate (migra personagens antigos)
  store.ts                       Zustand (CRUD + applySuggestions, undoLast, toggleLock…)
  useCharacter.ts                hook de leitura/escrita por id
  completion.ts                  Rascunho/Completo + checker regex (vazios, contradições)
  cn.ts, paths.ts                utilitários
  export.ts                      JSON, PNG, PDF, copiar
  db.ts                          Pool do Neon (server-side)
  auth/                          env (flag), server (Better Auth), client (authClient)
  sync/remoteSync.ts             fetch para /api/characters
  planos.ts                      planos, pacotes, custo em créditos e bloqueios por plano (cliente e servidor)
  creditos.ts                    saldo, débito/estorno atômicos, recarga mensal, ativação de plano (servidor)
  limites.ts                     gerações simultâneas e cota de armazenamento por plano (servidor)
  pagamentos/                    aplicar (compra → conta), stripe, usdc (Solana Pay), evm (Base/Arbitrum/BNB/Ethereum)
  persona/                       server (treino, ZIP, status), dataset (variações), usePersona
  voz/elevenlabs.ts              criar/clonar voz, gerar fala
  declaracoes.ts                 textos exatos das declarações obrigatórias
  video/                         ffmpeg (legenda, quadros, máscara, composição), troca (Kling/Seedance em trechos), lote (jobs em trechos), fal, runway (criar),
                                 jobs (estado comum), finalizar (tela/webhook/cron), legenda-ia (Bria),
                                 webhook (URL assinada), precos, server (helpers)
  storage/                       env (flag + limites), s3 (server), client (upload/fileUrl), useStorage,
                                 cleanup (órfãos do bucket)
  prompts/
    imagem.ts, roteiro.ts, video.ts, index.ts      Prompt Mestre
    sistema.ts                                     Prompt de sistema do personagem (base do "Escrever")
    escrever.ts                                    pedidos de legenda, roteiro e resposta
  ai/
    anthropic.ts                 client + askClaude; erros tipados
    schema.ts                    Zod envelopes + extractJson
    parse.ts                     askJson com retry/reparo de JSON
    flatten.ts                   payload nested → lista de Suggestion
    prompts.ts                   leitor + render dos .md
    rate-limit.ts                in-memory por IP
    strip.ts                     limpa _metadados e dataUrls antes de enviar à IA
    gemini.ts                    geração de imagem (Nano Banana) + reencode JPEG
    fal-imagem.ts                Seedream 4.5 / Flux.2 Pro / GPT Image pelo fal.ai
    modelos-imagem.ts            catálogo de modelos (rótulo, serviço, custo) — cliente e servidor

db/migrations/                   schema do Postgres (0001: Better Auth + characters; 0002: rate_limits; 0003-0004: video_jobs; 0005: créditos e pagamentos; 0006: limites; 0007: persona, vozes e consentimentos; 0008: links de vídeo; 0009: compra manual de créditos; 0010: persona rápida)

assets/fonts/                    Poppins Bold (OFL) — fonte das legendas geradas

data/
  steps.ts                       config das 7 etapas (título, ícone, dica)
  choices.ts                     opções fixas (gêneros, formas, traços, arquétipos…)
  prompts/                       templates em Markdown — editáveis sem tocar em componente
    expandir-ficha.md
    sugerir-campo.md
    regenerar-secao.md
    checar-consistencia.md
    sistema-personagem.md
```

## Como adicionar uma pergunta nova

1. Novo campo? Acrescente a propriedade em [`lib/types.ts`](lib/types.ts) e inicialize em [`lib/defaults.ts`](lib/defaults.ts) (também em `hydrate()` se for aditivo).
2. Abra o step correspondente em `components/steps/` e inclua um `<Field>` com o componente adequado. Passe `fieldId="chave.subchave"` para habilitar o badge "Sugestão da IA", o cadeado e o auto-confirm. Passe `aiDescricao` se quiser o botão "Sugerir com IA".
3. Registre a pergunta em [`data/perguntas.ts`](data/perguntas.ts) (mesmo `fieldId`, tipo e descrição). É isso que faz o prompt "Gerar no Claude" perguntar e o importador aceitar o campo.
3. Se o campo deve contar para "Rascunho/Completo" ou para o checker regex, adicione em [`lib/completion.ts`](lib/completion.ts).
4. Se o campo deve ir para a ficha ou os prompts, inclua em `lib/export.ts`, nos `lib/prompts/*` e em `data/prompts/expandir-ficha.md`.
5. Para a IA conhecer o novo campo, adicione a entrada no esquema de [`lib/ai/schema.ts`](lib/ai/schema.ts) e em `data/prompts/expandir-ficha.md`.

## Como adicionar uma etapa nova

1. Crie o componente em `components/steps/MinhaEtapaStep.tsx`.
2. Em [`data/steps.ts`](data/steps.ts), adicione um item em `STEPS` (id, título, subtítulo, ícone, dica).
3. Em [`lib/types.ts`](lib/types.ts), inclua o id na union `STEP_IDS`.
4. No `switch` dentro de [`components/wizard/Wizard.tsx`](components/wizard/Wizard.tsx), associe o novo id ao componente.
5. Em [`components/wizard/RegenerateSection.tsx`](components/wizard/RegenerateSection.tsx), adicione a lista de campos no `CAMPOS_POR_STEP`.

## Como editar o prompt da IA

Todos os templates estão em `data/prompts/*.md`. Variáveis são `{{nome}}`; a renderização substitui por valores do personagem/contexto. Os templates podem ser reescritos livremente — contanto que a saída continue sendo JSON válido para `lib/ai/schema.ts`.

## Escrever como o personagem

Na Revisão (com `ANTHROPIC_API_KEY`), o painel **"Escrever como …"** gera, na voz do personagem: **3 opções de legenda**, um **roteiro de vídeo curto** (gancho, cenas com falas, fechamento e legenda) ou **3 opções de resposta** a um comentário colado — para Instagram, TikTok ou YouTube Shorts. 3 créditos por pedido (`POST /api/escrever`). O system prompt é o Prompt de sistema montado da ficha (`lib/prompts/sistema.ts`); os pedidos ficam em `lib/prompts/escrever.ts`. Substituiu os botões de copiar o Prompt Mestre / Prompt de sistema para outra IA. A ficha sai em **Exportar ficha** (PNG, PDF ou JSON).

## Deploy

Vercel: importe o repo, defina as variáveis de ambiente (IA e/ou Neon + Better Auth, ver acima) em Environment Variables, deploy. Em produção, `BETTER_AUTH_URL` deve ser a URL pública do app.

## Status e pendências

Situação em 06/10/2026.

### Feito
- [x] Banco migrado de Supabase para **Neon** (Postgres); tabelas criadas pela migration `db/migrations/0001_init.sql`.
- [x] Login com **Google** via Better Auth (sem link mágico); OAuth client criado no Google Cloud com redirect `http://localhost:3000/api/auth/callback/google`.
- [x] Sync de personagens via `/api/characters` (só envia o que mudou; isolamento por `user_id`).
- [x] Geração automática de imagem com **Nano Banana** (card de referência + retrato, estilo Realista/3D, qualidade Padrão/Pro).
- [x] Armazenamento no **AWS S3**: referências, imagens geradas e upload de vídeos originais (painel "Substituir pessoa em vídeo", na Revisão). Bucket, credenciais e CORS (`localhost:3000`) configurados e validados por script.

### Falta configurar (fora do código)
- [ ] **Gemini com faturamento**: criar projeto no AI Studio (Dashboard → Projects), criar a API key nesse projeto, ativar billing (Tier 1 / pago) e trocar `GEMINI_API_KEY` no `.env`. Sem billing a API responde "free tier, limit 0" para modelos de imagem.
- [ ] **Alerta de orçamento** no Google Cloud (Faturamento → Orçamentos e alertas).
- [ ] **Testar o login de ponta a ponta** no navegador (rotas validadas por curl, login real ainda não feito).
- [ ] **Tela de permissão OAuth**: adicionar usuários de teste ou publicar o app, senão só contas de teste entram.
- [ ] **Deploy na Vercel** com todas as variáveis (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` = domínio público, `GOOGLE_CLIENT_ID/SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CRON_SECRET`, `GEMINI_API_KEY`, `FAL_KEY`, `RUNWAYML_API_SECRET`, `ELEVENLABS_API_KEY`, `APIFY_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SOLANA_MERCHANT_WALLET`, `SOLANA_RPC_URL`, `ANTHROPIC_API_KEY` se usada).
- [ ] **Redirect URI de produção** no OAuth client: `https://aistudio.nigo.global/api/auth/callback/google`.
- [ ] **CORS do bucket**: adicionar o domínio de produção em `AllowedOrigins`.
- [ ] Apagar o projeto antigo no **Supabase** (não é mais usado).

### Falta validar
- [ ] Primeira geração real de imagem (card realista e 3D) e ajuste fino dos prompts conforme o resultado.
- [ ] Tempo de resposta da rota `/api/gerar-imagem` na Vercel (configurada com `maxDuration = 120`).

### Ajustes feitos em 06/10/2026
- [x] Galeria persistente das imagens geradas (S3, até 30 por personagem).
- [x] Migração automática pro S3 das referências antigas em base64.
- [x] Limpeza diária de arquivos órfãos no S3 (cron + `CRON_SECRET`).
- [x] Estilo 3D também nos prompts de Midjourney e Flux.
- [x] Rate limit persistente no Neon + cota diária de imagens por conta.

### Vídeo (06/10/2026)
- [x] Editar legenda queimada (remover / trocar texto) com ffmpeg — testado no vídeo de exemplo com legenda.
- [x] Troca de pessoa pelo personagem: job assíncrono, resultado no S3. Motor padrão trocado de Wan 2.2 Animate para **Kling O1 Edit** (06/10/2026) — testado de ponta a ponta com 14s (2 trechos, 480p→720p, áudio original).
- [x] Tabela `video_jobs` criada no Neon.
- [x] Runway: "Criar vídeo" (Gen-4 Turbo, Gen-4.5, Veo 3.1 Fast). Migration 0004 aplicada no Neon. (O Aleph, antes motor premium da troca, foi substituído pelo Seedance 2.5 em 06/10/2026.)
- [x] Modelos de imagem extras pelo fal.ai: Seedream 4.5 (4K), Flux.2 Pro e GPT Image 2 (com "Texto na imagem").
- [ ] **Criar conta no fal.ai**, pôr `FAL_KEY`, gerar o mesmo personagem nos 4 modelos lado a lado e testar a primeira troca real de vídeo (exemplos em `public/landing/videos`).
- [ ] **Criar chave da API do Runway** e pôr `RUNWAYML_API_SECRET` (só para Criar vídeo).
- [ ] Primeira troca Premium (Seedance) real pela tela, com vídeo de 20–30s (uma parte só).
- [ ] Testar a edição de legenda no navegador logado (o processamento foi validado por script).
- [ ] Validar na Vercel que o binário do ffmpeg entra no pacote da função (`outputFileTracingIncludes` no `next.config.ts`) e o tempo de processamento.

### Planos e créditos (06/10/2026)
- [x] Planos Grátis/Starter/Creator/Studio + pacotes; créditos cobrados em todas as gerações com estorno em falha; bloqueios por plano; limite de personagens.
- [x] Stripe (assinatura mensal no cartão; anual e pacotes com cartão/Pix/boleto; portal) e USDC na Solana (Solana Pay, +5%).
- [x] Compra manual de créditos (mínimo 100) no Stripe e em USDC (migration 0009 aplicada).
- [x] Tabelas criadas no Neon (migration 0005); ciclo de créditos validado contra o banco real.
- [ ] **Configurar Stripe** (chaves, Pix/boleto, portal, webhook) e testar uma compra em modo de teste.
- [ ] **Configurar a carteira USDC** e testar um pagamento em devnet antes da mainnet.
- [ ] Contador: regime de impostos, emissão de nota e tratamento contábil do USDC.
- [x] Gerações simultâneas e cota de armazenamento por plano aplicadas (+ "Liberar espaço"); validadas contra Neon e S3.

### Persona treinada e voz (06/10/2026)
- [x] Conjunto de treino (variações + galeria + aprovação), declaração obrigatória registrada, treino Rápido (FLUX.1, 250 cr) e Pro (FLUX.2, 650 cr), 1 treino Rápido grátis/mês no Studio (migration 0010 aplicada).
- [x] Voz com ElevenLabs: criar pela descrição, clonar com declaração, gerar falas, colocar fala no vídeo.
- [x] Tabelas criadas no Neon (migration 0007); estorno de treino, "versão anterior continua valendo" e fala no vídeo validados.
- [ ] **Primeiro treino real** (`FAL_KEY`): comparar Rápido × Pro com o mesmo personagem (tempo, fidelidade do rosto, personagens estilizados/3D).
- [ ] **`ELEVENLABS_API_KEY`** e testar Voice Design em português.
- [ ] Sincronia labial (lip-sync) para as falas nos vídeos.

### Trocar pessoa por link (06/10/2026)
- [x] Busca via Apify (TikTok, Instagram, YouTube Shorts) ou .mp4 direto, sem salvar a origem no S3; troca com declaração registrada; só o resultado é salvo (migration 0008 aplicada).
- [ ] **`APIFY_TOKEN`** e testar um link de cada rede (os formatos dos actors mudam — se algum falhar, trocar por `APIFY_ACTOR_*`).

### Próximas entregas (código)
- [ ] **Validar o S3 no navegador** logado (upload de referência, upload de vídeo, abrir em outro navegador).
- [x] Remoção de legenda com IA (Bria Video Eraser em trechos de 4,8s + composição só na área da legenda) — pipeline de composição validado localmente; falta testar com `FAL_KEY`.
- [x] Finalização de vídeo com a página fechada: webhook do fal + cron de varredura (Runway) + atualização do personagem no banco — estorno e atualização validados contra o Neon.
- [ ] Cron de vídeo mais frequente (Vercel Pro ou cron externo) — hoje diário no Hobby.

## v3 — backlog

- [ ] Streaming das sugestões por etapa (hoje é um bloco só)
- [ ] "Usar minha chave Anthropic" (BYOK) opcional
- [ ] Compartilhamento da ficha por link público (`/ficha/[slug]`)
- [ ] Versionamento do personagem com diff entre gerações
- [ ] Cards de "Traço/estilo" com arte real em vez de placeholders
- [ ] Importar JSON de outra sessão / outro usuário
- [ ] Tradução para espanhol e inglês

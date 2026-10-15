# NIDO AI Studio — documentação técnica

> Conteúdo que estava no README até 07/10/2026: como rodar, configurar cada serviço, estrutura do projeto e histórico. A apresentação do projeto está no [README](README.md).

> **Deploy em produção (aistudio.nido.global):** passo a passo em [`DEPLOY.md`](DEPLOY.md) — variáveis da Vercel, Google, S3, bundle.social, Stripe e crons.

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
3. No [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**: criar um OAuth client **Web** com a redirect URI `http://localhost:3000/api/auth/callback/google` (e `https://aistudio.nido.global/api/auth/callback/google` em produção).
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
| Imagem com texto | GPT Image 2 | OpenAI (ou fal.ai sem `OPENAI_API_KEY`) | ~US$ 0,06 (média) / 0,20 (alta) |

Os modelos do fal aparecem quando `FAL_KEY` está preenchida. Com referências, usam o endpoint de edição (as imagens vão por URL pré-assinada do S3, ou pelo storage do fal no modo sem login); sem referências, o de texto. O GPT Image vai direto na API da OpenAI quando `OPENAI_API_KEY` está preenchida (as referências são enviadas como arquivo) e pelo fal quando não está. Nele aparece o campo **Texto na imagem**, que abre exceção à regra "sem texto" do prompt.

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
    "AllowedOrigins": ["http://localhost:3000", "https://aistudio.nido.global"],
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
  - **Padrão · Kling O3 Edit** no fal.ai (`lib/video/troca.ts`), em Standard (US$ 0,126/s → 13 créditos/s), Pro (US$ 0,168/s → 17 créditos/s) ou 4K (US$ 0,42/s → 42 créditos/s), trechos de até 15s; vai com quadro-âncora, close do rosto e descrição das outras pessoas (`lib/video/ancora.ts`), de 3s até o limite do plano (60s no Studio). A personagem vai **sem fundo** (recortada com BiRefNet e posta sobre branco — com fundo, o modelo copia o cenário da imagem). O Kling aceita 3–10s com lado menor ≥ 720px, então o vídeo vira **trechos iguais de até 10s** (ajustados para 720p+ e 24–60 fps) processados em paralelo; no fim os trechos são juntados e o **áudio original** volta por baixo. Testado: personagem 3D fiel, cenário e música mantidos. Dicas: personagem de **corpo inteiro** (meio corpo faz a IA inventar pernas/roupa, que podem variar entre trechos) e vídeo **sem cortes de cena**. Substituiu o Wan 2.2 Animate, que não trocava personagens 3D/estilizados.
  - **Premium · Seedance 2.5** (modo edição) no fal.ai — US$ 0,568/s em 720p (o fal cobra US$ 0,284 por segundo de entrada e de saída) → 57 créditos/s (gera no mínimo 4s), a partir do Creator. Aceita **até 30s de uma vez** (vídeos maiores viram partes de até 30s): no teste preservou melhor o cenário e os objetos (o Kling alterou o logo de um galão) e a roupa ficou coerente com o vídeo. Mesmo fluxo do Kling (personagem sem fundo, áudio original de volta). Substituiu o Runway Aleph, que custava o mesmo e exigia outra conta.
  - Nos dois motores dá para **remover legendas e textos da tela no mesmo passo** (vai no pedido à IA).
  Assíncrono: o app cria um job (`video_jobs`, com `provedor` fal/runway), consulta o serviço a cada 10s e, quando termina, salva o resultado no S3. Recomendado usar um **retrato de corpo inteiro** gerado na etapa Visual.
- **Criar vídeo** (Runway) — vídeo novo a partir da imagem do personagem (primeiro quadro) + texto da cena: **Gen-4 Turbo** (US$ 0,05/s, 5 ou 10s), **Gen-4.5** (US$ 0,12/s, 5 ou 10s) ou **Veo 3.1 Fast** (US$ 0,10/s, 0,15 com áudio; 4, 6 ou 8s). Vertical ou horizontal. O texto inicial vem da primeira ideia de conteúdo da ficha. Com `SAPIENS_KEY` (Sapiens Sintéticos, API em beta) entra o **Kling V3 Standard** (US$ 0,053/s, 0,079 com áudio; 5, 10 ou 15s por cena → 6 e 8 créditos/s) e o **Veo 3.1 Fast passa a ser gerado por lá** (US$ 0,079/s, 0,119 com áudio; os créditos não mudam). O Sapiens segue o formato da imagem, então ela é recortada em 9:16 ou 16:9 antes de ir (`lib/video/sapiens.ts`).

- **Legenda com IA** — para fundos complexos (o `delogo` deixa borrão): **Bria Video Eraser** (máscara) no fal.ai, US$ 0,14/s → 15 créditos/s, até 60s, a partir do Starter. O modelo aceita 5s, então o vídeo vira trechos de 4,8s processados em paralelo (`lib/video/legenda-ia.ts`); no fim os trechos limpos são juntados e **só a área da legenda** é aplicada sobre o original (resto da imagem e áudio intactos), com a legenda nova por cima no modo "trocar". Assíncrono, como a troca de pessoa.

Dá pra combinar: remover a legenda do original → trocar a pessoa → colocar legenda nova no resultado.

**Finalização com a página fechada** ([`lib/video/finalizar.ts`](lib/video/finalizar.ts)): os jobs de vídeo terminam por três caminhos, todos idempotentes (um "claim" no banco garante uma finalização só):
1. **Webhook do fal** (`POST /api/videos/webhook?job=…&t=…`, URL assinada com HMAC do `BETTER_AUTH_SECRET`). O corpo é ignorado — a finalização confere o estado na API do fal. Só é enviado quando `BETTER_AUTH_URL` é `https` público (em localhost não há como o fal chamar).
2. **Cron** `GET /api/cron/video-jobs` (com `CRON_SECRET`): varre os pendentes — cobre o **Runway, que não tem webhook**, e webhooks perdidos. Pendentes há mais de 48h viram erro com estorno.
3. **A tela**, a cada 10s, enquanto a página está aberta.

Ao finalizar, o vídeo é atualizado **dentro do personagem no banco** — aparece ao reabrir o app. Falhas devolvem os créditos e marcam o vídeo com erro.

> **Frequência do cron:** no plano Hobby a Vercel só permite cron diário (`vercel.json` está diário). Para o Runway terminar em minutos com a página fechada: plano Pro com `"schedule": "*/5 * * * *"`, ou um cron externo grátis (ex.: cron-job.org) chamando `GET https://aistudio.nido.global/api/cron/video-jobs` a cada 5 min com o header `Authorization: Bearer $CRON_SECRET`.

Custos e limites:
- Troca: Kling O3 Edit Standard US$ 0,126/s, Pro US$ 0,168/s, 4K US$ 0,42/s (mínimo 3s); Seedance 2.5 US$ 0,568/s (entrada + saída; mínimo 4s gerados). Criar vídeo (Runway) conforme o modelo acima. A tela mostra a estimativa antes de enviar (`lib/video/precos.ts`).
- `VIDEO_MAX_SECONDS` (padrão 60) por vídeo e `VIDEO_DAILY_SECONDS` (padrão 180) por conta/dia, contados no Neon. A duração é medida no servidor.

Para ligar a troca de pessoa:
1. Conta em [fal.ai](https://fal.ai) com créditos → **Dashboard → Keys** → criar chave.
2. `.env.local` / Vercel: `FAL_KEY=...`.
3. Rodar `db/migrations/0003_video_jobs.sql` e `0004_video_jobs_provedor.sql` no Neon.

Para ligar o Runway (Criar vídeo):
1. [dev.runwayml.com](https://dev.runwayml.com) → criar organização, adicionar créditos → **API Keys**.
2. `.env.local` / Vercel: `RUNWAYML_API_SECRET=...`.

Para ligar o Sapiens (Kling V3 e Veo mais barato no Criar vídeo): criar a chave em [sapiensinteticos.com/dashboard/developers](https://www.sapiensinteticos.com/dashboard/developers#chaves), pôr saldo e `SAPIENS_KEY=...` no `.env.local` / Vercel. Sem a chave, o Kling V3 some da tela e o Veo segue no Runway.

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

## Live do personagem (em teste: só admin)

Estúdio → **Live** (`/app/live`; recurso em teste `live` em `lib/em-teste.ts`). Precisa de `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (LiveKit Cloud), `RUNWAYML_API_SECRET`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, S3 e a migration `0037_lives.sql`.
- **Preparar** (`POST /api/live`, grátis): o Runway monta o avatar (`gwm1_avatars`) a partir da imagem escolhida, recortada no rosto como no vídeo falado. Avatar pronto da mesma imagem (live ou vídeo falado anterior) é reaproveitado.
- **Entrar no ar** (`POST /api/live/[id]/iniciar`): cobra a duração escolhida (35 créditos/min, `CREDITOS_LIVE_POR_MINUTO`) e abre uma sessão em tempo real do Runway ligada a uma sala do LiveKit (`integration: livekit`). O avatar entra como `runway-avatar-agent`; o navegador do operador entra como `nido-<id>`.
- **Falas** (`POST /api/live/[id]/fala`): a IA responde a mensagem do chat como o personagem (`promptSistema` + `lib/prompts/live.ts`, modelo `LIVE_MODEL`) e a ElevenLabs Flash devolve PCM 16 kHz em streaming. O navegador repassa o áudio ao avatar por byte stream (`lk.audio_stream`, o protocolo de avatar do LiveKit Agents) e o Runway publica vídeo e áudio sincronizados. `lk.playback_finished` avisa o fim da fala; `lk.clear_buffer` corta.
- **Sem personagem** (aba "Foto avulsa"): a pessoa envia uma foto (S3, `refs`), escreve o nome e quem é/como fala (vira o prompt no lugar da ficha: `promptPersonaAvulsa`) e escolhe uma voz pronta da biblioteca. Fica em `lives.persona`, com `character_id` vazio. Com personagem, uma voz pronta escolhida na hora fica salva nele (`vozBiblioteca`).
- **Cenário** (`lib/live/cena.ts`, `lives.cena`): fundo da foto, um lugar descrito em texto ou uma imagem do lugar. Antes de virar o avatar, a foto recortada vai para o cenário com o Nano Banana. Por texto, a IA da live (`LIVE_MODEL`, sem raciocínio) primeiro reescreve o pedido, em qualquer língua, num pedido de imagem em inglês detalhado (`melhorarCena`; se falhar, segue o texto original); o pedido da imagem mantém rosto, cabelo e corpo e só muda algo na pessoa (fone, microfone…) quando pedido. Por imagem, a foto do lugar entra como segunda referência. Cobra `CREDITOS_CENARIO` (5) ao preparar, devolvidos se falhar; mesma foto + mesmo cenário reaproveita o avatar sem cobrar. Avatar com cenário nunca é reaproveitado numa live sem cenário (e vice-versa). As personas salvas guardam o cenário.
- **Jogo na tela** (aba Jogo, `components/live/Jogo.tsx`): o operador compartilha uma tela/janela (`setScreenShareEnabled`, com áudio) ou toca um vídeo gravado do computador (não sobe: `captureStream` do `<video>` + o som por um mixer Web Audio), publicado na sala como fonte "tela". O palco (`/live/palco`) monta o layout sozinho: sem jogo, só o avatar; com jogo, jogo em tela cheia e avatar no canto (em pé: jogo em cima, avatar embaixo); som do jogo a 35%. Vídeo gravado exige a declaração `DECLARACAO_VIDEO_LIVE` (registrada em `consentimentos`, tipo `video_gravado_live`). A cada fala, uma imagem do jogo (JPEG 768 px) vai para a IA (`tela` na rota de fala → `askClaude` com imagem); com jogo, o tipo "jogo" (comentar o lance) domina o sorteio do modo apresentador.
- **Transmissão da página do palco:** com o app num endereço https (`BETTER_AUTH_URL`), a transmissão para as redes grava a própria página do palco (`StartEgress` com `web`, `limpo=1`), então o layout com o jogo vai junto; fora disso (localhost), grava só o avatar da sala (`media`).
- **Piloto automático** (painel → aba Chat): "Responder o chat sozinho" responde a fila, e "Falar sozinho quando o chat parar" (modo apresentador) faz o personagem falar por conta própria depois de um silêncio (ritmo calmo 15 s, normal 7 s, agitado 2,5 s), sobre o assunto da live ou o nicho da ficha. O tipo de cada fala espontânea é sorteado no servidor (`proximoTipo` em `lib/prompts/live.ts`: assunto, piada, pergunta, retomar alguém do chat, boas-vindas; pesos e intervalo mínimo por tipo), porque sozinha a IA terminava toda fala com pergunta. A memória da live (últimas 8 falas e respostas) vai em todo pedido, para não se repetir. Se uma fala espontânea falhar, o modo se desliga.
- **Discord** (`components/live/GuiaDiscord.tsx`, `worker/discord/bot.ts`): com vídeo, pela conta da pessoa (guia na tela: OBS + câmera virtual + VB-Cable); ou só voz, pelo bot do NIDO. O bot é um processo à parte, sempre ligado (Railway), que lê o banco a cada 5s: toda live no ar com `chat.discord` (gravado por `ligarDiscord`, que confere o canal com o token do bot) ganha o bot no canal de voz ou palco. Ele entra na sala do LiveKit só para ouvir (invisível) e toca no Discord o áudio do avatar (48 kHz estéreo, `@livekit/rtc-node` → `@discordjs/voice`, com DAVE); no palco tenta virar orador e, sem permissão, pede para falar. Mensagens do chat do canal vão para `live_chat` (origem `discord`). O estado do bot (`chat.discord.estado`) aparece no painel do chat. Sai quando a live encerra ou o Discord é desligado.
- **Transmitir direto** (`/api/live/[id]/transmitir`, `lib/live/transmissao.ts`): a pessoa marca as redes (YouTube, Twitch, Kick, TikTok) e cola servidor + chave de cada uma. O LiveKit grava o avatar (`StartEgress` com `participant_video` do avatar + todo o áudio da sala) e manda por RTMP: um envio 16:9 para as redes deitadas e um 9:16 para o TikTok. Começa sozinho quando o avatar aparece. As chaves vão só para o LiveKit (no banco ficam os ids dos envios); no navegador só com "Lembrar". Para ao encerrar a live. Custo do LiveKit: ~US$ 0,02/min por envio, dentro do preço por minuto da live.
- **Palco** (`/live/palco#u=…&t=…`): página pública que só assiste (token sem publicar, invisível), para a fonte de navegador do OBS. Continua valendo como alternativa (OBS).
- **Chat:** mensagens coladas pelo operador ou lidas sozinhas (`lib/live/chat.ts`, rota `/api/live/[id]/chat`):
  - **Twitch:** leitura anônima do IRC, direto no navegador.
  - **YouTube** (`YOUTUBE_API_KEY`): pelo link da live, acha o `activeLiveChatId` e busca as mensagens novas (`liveChatMessages.list`, 5 unidades da cota) no máximo a cada 8s, quando a página pergunta. A cota padrão (10 mil/dia) dá ~4h de live por dia; dá para pedir aumento ao Google.
  - **Kick** (`KICK_CLIENT_ID`/`KICK_CLIENT_SECRET`): token do app (client credentials), inscrição em `chat.message.sent` do canal; o Kick manda cada mensagem para `/api/live/kick/webhook` (assinatura RSA conferida com a chave pública do Kick). A inscrição sai ao encerrar a live.
  - As mensagens do YouTube e do Kick ficam em `live_chat`; a página pega as novas a cada 3s. Resposta manual ou automática (uma por vez).
- **Encerrar** (`POST /api/live/[id]/encerrar`, também ao fechar a página): cancela a sessão do Runway, soma o tempo no ar e devolve os minutos não usados (minuto começado conta inteiro). Live que ficou aberta é acertada ao abrir a lista e no cron `/api/cron/video-jobs`. O Runway encerra sozinho no fim da duração (`maxDuration`).
- **Sombra ao vivo** (aba "Sombra ao vivo", `lives.tipo = 'sombra'`, migration `0040`; `DECART_API_KEY`): a webcam de quem faz a live vira o influencer (personagem ou foto) com o **Lucy 2.5 em tempo real** da Decart. Sem Runway e sem IA respondendo: quem fala é a pessoa. Ao entrar no ar, o navegador liga a câmera **antes** de cobrar (150 créditos/min, `CREDITOS_SOMBRA_POR_MINUTO`; devolve o que não usar), pega um token curto em `POST /api/live/[id]/decart` (só `lucy-2.5`, só a origem do app, sessão de até 1 h) junto com o pedido do Lucy, e publica na sala o vídeo transformado (câmera) e a voz (microfone) — `components/live/sombra.ts`. O palco, o OBS, o Discord e a transmissão para as redes funcionam como na live do avatar (o envio grava o operador `nido-<id>`). A sessão do Lucy cai a cada 1 h (teto do token) ou numa queda de rede: reabre sozinha até 3 vezes; depois, botão "Reconectar a Sombra".
  - **Voz**: a própria (atrasada ~250 ms pelo `DelayNode` para casar com a boca; ajustável na tela em "Sincronia da voz") ou trocada por uma voz da ElevenLabs (`voice_id`): o microfone é cortado em pedaços nas pausas (até 2,5 s, detecção de fala por energia), cada pedaço vai para `POST /api/live/[id]/voz` (speech-to-speech, `eleven_multilingual_sts_v2`, PCM 16 kHz; ~1,2 s por pedaço) e toca na hora em que foi falado + 4 s. O vídeo é atrasado os mesmos 4 s (`MediaStreamTrackProcessor/Generator`, só Chrome/Edge), então boca e voz casam e a live vai com 4 s de atraso — o público não percebe. Em outro navegador a voz sai depois da boca (aviso na tela).
  - **Cenário** (só por texto): `cenaParaLucy` reescreve em inglês curto (o fundo e, se pedido, um item na pessoa) e `pedidoDaSombra` monta "Replace the person in the video, including their clothes, with… Change the background to…" — nessa ordem: com o fundo antes, ou um pedido longo, o Lucy deixa o fundo como está; sem "including their clothes", sobra roupa do original (testado). O item na pessoa (fone…) é melhor esforço.
  - A Decart põe um selo **"AI Generated"** no vídeo em tempo real (no lote, não). A página precisa de câmera liberada: `Permissions-Policy: camera=(self)` em `next.config.ts`.
- **Sombra de vídeo gravado** (aba "Sombra de vídeo", `POST /api/live/sombra-video`): uma live gravada inteira (até 12 h) ou só um trecho dela ("começar no minuto X e usar Y minutos"), com a pessoa trocada pelo influencer no **Lucy 2.5 em lote** (720p). De onde vem: **link da Twitch ou do Kick** (VOD ou clipe; `worker/sombra/vod.ts` confere o link, mede a duração e acha o HLS — API GraphQL do site da Twitch e API do site do Kick, sem baixar nada na hora; `POST /api/live/sombra-video/link` mostra título, miniatura e duração), **arquivo enviado** (até 5 GB, pasta `lives` do S3, apagado depois de usar) ou link do YouTube/TikTok/Instagram/X pelo buscador de vídeos (até 3 min). Cobra 5 créditos por segundo do trecho (`creditosSombraVideo`, duração medida no servidor), exige a declaração `DECLARACAO_VIDEO_LINK` (`consentimentos`, tipo `uso_video_sombra`) e vira um `video_jobs` (`character_id 'sombra'`) acompanhado como os outros vídeos; o resultado aparece na tela (com o andamento) e na **Sombra**.
  - **Vídeo inteiro de até 3 min** (arquivo ou link buscado): o app manda direto para a Decart (`provedor 'decart'`) e, ao terminar, `lib/live/sombra-video.ts` põe de volta o áudio do original — ou a fala trocada pela voz escolhida (speech-to-speech em pedaços de 1 min, 24 kHz, sem o som de fundo).
  - **O resto** (lives longas, trechos, Twitch e Kick): `provedor 'nido'`, processado pelo **processo da Sombra** (`worker/sombra`, sempre ligado no Railway — a Vercel não aguenta horas nem gigabytes). Ele pega o job no banco (`for update skip locked`; sinal de vida a cada minuto em `input.trabalho.vivoEm`, e outro processo retoma depois de 10 min sem sinal), divide o trecho em partes de ~5 min (no HLS, na divisa dos pedaços; no arquivo, cortes precisos reprocessados em 720p), manda 3 partes por vez ao Lucy, junta o áudio de cada parte (original, ou trocado na ElevenLabs sem o som de fundo — então o som do jogo sai), sobe cada parte pronta para o S3 (`input.trabalho.partes`: retoma do que já estava pronto) e no fim emenda tudo num MP4 só (fragmentado, sem reprocessar, enviado em partes de 64 MB) e chama o cron de vídeos do app (`APP_URL` + `CRON_SECRET`), que finaliza pelo caminho de sempre (`consultarNido` em `lib/video/jobs.ts` → "nido:<key>"; erro devolve os créditos). Se nenhum vídeo da Sombra der sinal de vida em 15 min e o job continuar sem dono, ele falha ("o processo da Sombra não está ligado") e os créditos voltam. Decart sem saldo (402) falha na hora, com aviso.
  - Funciona bem com câmera de streamer no canto: o Lucy troca a pessoa e deixa o jogo. VOD só para inscritos, ou apagado, não abre (baixar e enviar o arquivo).
- Código: `lib/live/*`, `app/api/live/*`, `components/live/*`.

## Vídeo de produto (em teste: só admin)

Estúdio → **Produto** (`/app/produto`; recurso em teste `video_produto` em `lib/em-teste.ts` — o admin libera para todos na aba "Em teste"). O influencer (um personagem ou uma foto avulsa) mostrando e usando um produto, com ou sem fala, em 10, 15, 30, 45 ou 60 s. Não precisa de serviço novo: usa os mesmos modelos do "Criar vídeo" e do vídeo falado.
- **Montar cenas** (`POST /api/produto/roteiro`, `CREDITOS_TEXTO.escrever`): o Claude (`askJson`, `sistemaRoteiroProduto` em `lib/produto.ts`) escreve o que se vê em cada cena (inglês, sem marca nem texto na tela — a moderação dos modelos barra) e, com fala, o que a pessoa diz: as falas escritas pela pessoa, divididas entre as cenas, ou escritas pela IA (UGC: gancho, benefício, chamada). O número de cenas vem de `cenasDoProduto`: com fala, uma a cada 15 s (até 4); sem fala, as cenas que o modelo gera (`cenasDoVideo`, até 8). A tela mostra as cenas para editar (com "Ver em português": tradução só para leitura, `POST /api/produto/traduzir`, sem cobrar). A IA **vê as fotos** (a pessoa e até 3 do produto) e segue regras que vieram de um teste real (15/10, Gen-4.5: tênis "voando", um segundo par nos pés, cores inventadas): uma ação simples por cena, física real (o produto sempre na mão, no corpo ou apoiado — `FISICA_DO_PRODUTO` também vai no pedido do vídeo), um produto só, continuidade entre as cenas e câmera calma.
- **Gerar** (`POST /api/produto`): cada cena ganha uma imagem nova — a pessoa da foto com o produto da outra foto, fazendo o que a cena pede, já no formato do vídeo (`promptImagemDaCena`, Nano Banana Pro quando o plano tem a qualidade Pro, senão o padrão; uma segunda tentativa se falhar). Créditos: a imagem de cada cena (`creditosImagemDaCena`) mais o vídeo.
  - **Com fala** (Seedance, Wan 3.0 ou Hailuo 3 — o avatar em close não entra, não mostra o produto): a fala de cada cena vira MP3 na voz escolhida (ElevenLabs) e o job é um vídeo falado em cenas (`input.falado`), com a ação de cada cena em `CenaFalada.acao` (`promptComAcao` em `lib/video/falado.ts`, usado pelos três modelos). Cobra o teto e devolve o que a fala não usar, como o vídeo falado.
  - **Sincronia boca × voz** (todo vídeo falado de corpo inteiro, `lib/video/sincronia.ts`): o modelo gera a própria fala e a boca segue ela — mas nem sempre no zero (o Wan 3.0 começou 0,67 s depois e 3% mais lento). Na união (`juntarFalas`), o volume da fala do clipe e do MP3 dá o atraso e o ritmo; o começo parado do clipe é cortado (fica 0,25 s de pausa), o MP3 é atrasado e esticado (`adelay` + `atempo`) para cair em cima da fala do modelo e o último quadro é repetido se o clipe acabar antes. Clipe sem áudio, diferença pequena ou falas que não batem (ritmo fora de 0,85–1,18): fica como era (MP3 no zero, corte no fim dele).
  - **Sem fala** (Gen-4, Veo, Kling, Wan): o job é uma cadeia de cenas (`input.cadeia`) com `imagens` e `prompts` de cada cena: na finalização, a cena seguinte parte da imagem dela (em vez do último quadro da anterior) com o pedido dela (`proximaCena` em `lib/video/cadeia.ts`). Som ambiente opcional nos modelos com áudio.
  - Com personagem, o vídeo também entra no Estúdio dele (`registrarVideoNoBanco`); com foto avulsa, o job usa `character_id 'produto'` e o aviso leva à tela do produto. O histórico (`GET /api/produto`) lista os `video_jobs` com `input.produto`.
- **Música de fundo** (opcional, `lib/musica.ts`): um áudio enviado (pasta `audios`) ou tirado de um link do YouTube/TikTok/Instagram/X (`POST /api/videos/musica`, Apify como o vídeo por link, até 5 min, `CREDITOS_LINK`), sempre com a declaração `DECLARACAO_MUSICA` (`consentimentos`). No vídeo de produto vai em `input.musica` e entra na finalização, depois de unir as cenas (`comMusica` → `misturarMusica` em `lib/video/ffmpeg.ts`: repete se for curta, fade, e abaixa sozinha enquanto há fala — sidechain).
- Código: `lib/produto.ts`, `app/api/produto/*`, `components/produto/*`, `components/musica/EscolherMusica.tsx`.

## Motion (em teste)

Estúdio → **Motion** (`/app/motion`, recurso em teste: só admin até ser liberado na área admin, aba "Em teste"). **Créditos** (`lib/motion-creditos.ts`, migration `0043_motion_creditos.sql`): gerar e ajustar reservam a estimativa da tela (`creditosMotion(estimativaMotion(...))`, 1 crédito = US$ 0,01 de custo da IA); quando o worker termina, o acerto cobra o custo real — devolve a sobra ou cobra a diferença (sem saldo, fica por conta da NIDO) — e, se falhou, devolve tudo. O acerto roda quando a tela lista os motions e no cron `/api/cron/video-jobs` (a cada minuto pelo relógio do worker). Gravar o MP4 não cobra. Crédito gasto rende pontos. Um modelo de IA escreve uma animação (motion graphics) num HTML só, de um **site**, de um **produto**, de um **influencer** ou do influencer com o produto/site. A tela mostra a animação tocando, aceita ajustes e grava o MP4. Tabela `motions` (migration `0041_motion.sql`); o trabalho é feito pelo **processo do Motion** (`worker/motion`, no Railway — gerar com o Opus em esforço alto passa dos 5 min da Vercel, e gravar precisa de um Chrome).
- **Pedido** (`POST /api/motion`): as fotos enviadas (produto, até 3, e o influencer) viram imagens que o modelo usa como `asset://a1`…; com o fal, também a versão sem fundo de cada uma (`recortarFigura`, BiRefNet), para flutuarem na animação. O pedido fica na fila (`status 'na_fila'`).
- **Modelos** (`worker/motion/modelos.ts`, preço por milhão de tokens): Claude Opus 5.5 (US$ 4/20, o padrão, esforço alto), Fable 5.1 (10/50, o mais forte), Sonnet 5.5 (2/10), Haiku 5.5 (0,10/0,50), Gemini 4 Argon (2/10 até 30/11, depois 4/20; exige a chave paga do Gemini) e GPT-6.1 Sol (2/10, Responses API da OpenAI, `OPENAI_API_KEY`; esforço em `reasoning.effort`). O esforço (low → max) controla quanto o modelo pensa: mais caprichado, mais caro e mais demorado. A tela mostra uma estimativa; o custo real (tokens) fica em `motions.uso`.
- **Worker — gerar**: pega o pedido (`for update skip locked`, sinal de vida em `vivo_em`; parado há 10 min, outro processo retoma), abre o site num Chrome (Playwright; fotos no computador e no celular, logo recortado, títulos, botões e cores — `worker/motion/site.ts`; endereços da rede interna são recusados), manda o pedido e as imagens ao modelo em streaming (Claude com `fallbacks: "default"`, a reserva da Anthropic quando o modelo recusa; Gemini com `thinkingLevel`; GPT pela Responses API), tira o HTML da resposta, **confere se ele carrega** num Chrome (`testarHtml`) e, se quebrar, pede **uma correção** ao modelo com o erro. O HTML fica no S3 (`users/<id>/motion/<id>.html`).
- **Revisão visual**: depois de conferir que o HTML carrega, o worker fotografa 8 instantes (`fotografar`) e manda ao mesmo modelo com o HTML (`pedidoRevisao`): ele responde OK ou o HTML corrigido (que só fica se carregar). Pega defeito que só aparece na imagem — no primeiro teste real (15/10), acentos de títulos escondidos (Á, É de "CLÁSSICO", "PÉ") vazavam da máscara e pareciam erros de português sobre outros títulos; o sistema também manda esconder texto fora da tela com `autoAlpha: 0`. O idioma dos textos é o da conta (`input.idioma`). Custa ~35% a mais (está na estimativa).
- **Música do MP4**: escolhida no painel (`acao: "musica"`, o MP4 anterior deixa de valer); a prévia toca junto (botão de som) e o worker põe por baixo do vídeo gravado (`colocarMusica`).
- **O relógio** (`worker/motion/runtime.ts`, posto no começo de todo HTML): GSAP 3.13 com todos os plugins (CDN fixa) e a API `motion.build` / `motion.timeline` / `motion.onFrame`. Tudo que se mexe passa pela linha do tempo pausada (tweens soltos são puxados para ela), pelas animações CSS (pausadas e posicionadas) ou pelo `onFrame`; `Math.random` tem semente. Assim qualquer instante é desenhado na hora, na ordem que for: a prévia toca em loop num iframe isolado (`sandbox="allow-scripts"`, play/pausa/barra por `postMessage`) e a gravação pula quadro a quadro.
- **Worker — gravar** (`POST /api/motion/[id]` com `acao: "exportar"`): abre o HTML num Chrome do tamanho do vídeo (1080×1920, 1920×1080 ou 1080×1080), pula o relógio para cada quadro (30 fps), tira a foto e manda para o ffmpeg (H.264, `worker/motion/renderizar.ts`). ~70 ms por quadro: 60 s de vídeo em ~2 min. MP4 em `users/<id>/motion/<id>.mp4`.
- **Ajustar** (`acao: "ajustar"`): um motion novo com o HTML atual e o pedido de mudança (o modelo devolve o HTML inteiro). **Baixar HTML** (`/api/motion/[id]/html?modo=arquivo`): o arquivo com as imagens dentro, que toca em qualquer navegador.
- A tela avisa quando o worker não deu sinal de vida no último minuto e meio (tabela `motion_worker`). A limpeza diária guarda os arquivos de `motions`. Pronto ou com falha (o HTML e o MP4), o worker põe um aviso no sino (tabela `avisos`), então dá para fechar a tela e esperar.
- **Relógio dos vídeos** (também no worker do Motion, com `APP_URL` e `CRON_SECRET`): a cada minuto chama `/api/cron/video-jobs`. Os vídeos em cenas (produto, criar, falado, troca de pessoa) só avançam quando alguém consulta o job — a tela aberta, o webhook do fal ou o cron; no plano Hobby a Vercel só roda cron uma vez por dia. Com o relógio, eles terminam com o navegador fechado (e o aviso chega no sino). Uma chamada por vez.
- Rodar o worker no computador: `cd worker/motion && npm install` e `MOTION_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" npx tsx --env-file=../../.env index.ts` (usa o Chrome instalado; no Railway, o da imagem do Playwright).
- Código: `worker/motion/*` (tipos, modelos e relógio também são usados pelo app), `lib/motion.ts`, `lib/motion-creditos.ts`, `app/api/motion/*`, `components/motion/*`.

## Trocar pessoa por link

Na lista de vídeos, **Colar link** (TikTok, Instagram reel/post, YouTube Shorts ou link direto de .mp4; até 3 min):
1. O servidor busca o arquivo do vídeo com o **Apify** (`APIFY_TOKEN`; actors configuráveis por `APIFY_ACTOR_*`), baixa numa pasta temporária, mede e deixa uma **cópia temporária no storage do fal** só pra IA ler — **o vídeo de origem não vai pro S3**. Custa 3 créditos (devolvidos se falhar). O link vale 24h (`links_video`).
2. Abre a troca de pessoa normal (Kling O3 ou Seedance 2.5) com a imagem do personagem, mais a **declaração obrigatória**: *"Declaro que tenho direito de usar este vídeo (sou o autor ou tenho autorização) e que vou sinalizar que o personagem é sintético."* — registrada em `consentimentos` com o link.
3. Só o **vídeo gerado** é salvo no S3 e entra na lista (com o link de origem guardado como referência).

## Publicar e agendar nas redes (bundle.social)

Estúdio → **Publicar** (`BUNDLE_SOCIAL`; a partir do Starter). Redes: **Instagram, TikTok, YouTube Shorts, X (Twitter) e LinkedIn**.

- **Contas por influencer:** cada influencer vira um *time* no bundle.social (`social_times`), com as contas sociais dele. "Conectar redes" abre o portal hospedado do bundle.social (OAuth de cada rede, escolha de página/canal, em português) e volta para o Estúdio.
- **Post:** mídia do personagem (vídeo pronto ou imagem gerada, enviada ao bundle.social por URL pré-assinada do S3), legenda (com "Escrever com IA"), título (YouTube) e as redes. **Publicar agora** ou **Agendar** (data/hora local → UTC). Validação por rede antes de enviar: X até 280 caracteres, YouTube só vídeo e com título, Instagram/TikTok/YouTube exigem mídia, LinkedIn exige texto.
- Tipos por rede: Instagram Reel (vídeo) ou Post (imagem), TikTok Vídeo/Imagem público, YouTube **Short**, X e LinkedIn com a mídia anexada. Todo post sai **marcado como conteúdo gerado por IA** onde a rede permite (`isAiGenerated` no Instagram/TikTok/X, `containsSyntheticMedia` no YouTube).
- **Acompanhamento:** posts em `posts_agendados` com o status do bundle.social (Agendado, Publicando, Em análise, Publicado com link, Falhou com o motivo por rede). Atualiza pelo **webhook** `POST /api/social/webhook` (`post.published`, assinatura em `BUNDLE_SOCIAL_WEBHOOK_SECRET`) e, sem webhook, ao abrir a tela (e a cada 30s enquanto publica). Posts agendados podem ser cancelados.
- **Custo:** 6 créditos por rede por post (`CREDITOS_POST_POR_REDE`; escrever + publicar em uma rede = 10 créditos, ~20% abaixo do post da Otto; o bundle.social cobra por post: Free 20/mês, Pro US$ 100 = 10 mil). `lib/social/{bundle,redes}.ts`, rotas em `app/api/social/*`.

## Planos, créditos e pagamentos

Com login configurado, toda geração com IA gasta **créditos** (1 crédito ≈ US$ 0,01 do custo nos serviços). O custo aparece no botão antes de gerar; se a geração falhar, os créditos voltam na hora (nos vídeos, quando o serviço reporta a falha). Sem login (modo dev), não há créditos — valem as cotas diárias fixas.

| | Grátis | Starter | Creator | Studio |
|---|---|---|---|---|
| Preço/mês (anual −20%) | — | R$ 79 · US$ 15 | R$ 199 · US$ 39 | R$ 499 · US$ 99 |
| Créditos/mês | 50 (uma vez) | 600 | 1.600 | 4.200 |
| Personagens | 1 | 3 | 10 | 30 |
| Imagem | NB Padrão, Seedream | + Flux.2, GPT média | todos, inclusive Pro | todos |
| Trocar pessoa (Kling O3) | — | até 15s | até 30s | até 60s |
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
- **Stripe (USD, só cartão)**: plano mensal = assinatura no cartão (ativada/renovada a cada `invoice.paid`); anual e pacotes = pagamento único no cartão. O checkout fixa `payment_method_types: ["card"]`, então Pix e boleto não aparecem. Portal do Stripe para cancelar/trocar cartão. Trocar de plano mensal cancela a assinatura anterior (sem pró-rata).
- **USDC (Solana, Base, Arbitrum, BNB Chain, Ethereum)**: o usuário escolhe a rede no modal e paga o preço exato (2 casas). Na Solana a confirmação é automática pelo QR (Solana Pay, referência única); quem paga sem o QR (corretora, envio manual) cola o link/hash da transação e aí vale o valor exato da cobrança, como nas EVM. Abrir o modal não cria cobrança: ela só nasce quando a pessoa paga pela carteira ou pede o QR (até lá o modal mostra o preço de tabela). **Com carteira instalada no navegador, o pagamento sai dela:** o botão ao lado do sino conecta uma carteira Solana (Wallet Standard) e uma EVM (EIP-6963: MetaMask, Rabby, Coinbase Wallet, Phantom…), sem assinar nada; no modal, "Pagar com a carteira" pede a transferência (na Solana o servidor monta a mesma transação do QR, com a referência; nas EVM a carteira troca de rede e chama `transfer` no USDC) e o app manda o hash ao servidor até confirmar, mesmo com o modal fechado ou a página recarregada. QR e transferência manual continuam como alternativa. Nas EVM o QR é um link EIP-681 e, depois de pagar, o usuário cola o link/hash da transação: o servidor lê o recibo e confere destino (`EVM_MERCHANT_WALLET`), token USDC, valor, horário (depois da criação da cobrança, até 24h) e confirmações; cada transação paga uma cobrança só, e a carteira pagadora fica salva (`pagador`). Se o RPC do `.env` falhar, usa RPCs públicos de reserva. Na BNB Chain o USDC é o Binance-Peg (18 casas). Sempre pré-pago (mensal = 1 mês, anual, pacotes), **+5% de créditos**. O app gera link + QR com uma referência única; a tela consulta a cada 5s e o servidor confere na blockchain se a carteira da NIDO recebeu o valor em USDC. Cobrança expira em 24h. Cada cobrança em aberto de uma rede tem um valor único (preço + 0 a 99 centavos), escolhido dentro de uma transação com trava por rede (`pg_advisory_xact_lock`); a mesma compra, na mesma rede, reaproveita a cobrança em aberto da conta por até 12h.

Para ligar:
1. Rodar `db/migrations/0005_creditos.sql`, `0006_limites.sql` e `0007_persona_voz.sql` no Neon.
2. **Stripe**: conta Brasil, cartões ativos em *Settings → Payment methods* (cobrança em USD, sem Pix/boleto), ativar o *Customer portal*. `STRIPE_SECRET_KEY` + webhook em `https://aistudio.nido.global/api/pagamentos/stripe/webhook` com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`. Local: `stripe listen --forward-to localhost:3000/api/pagamentos/stripe/webhook`.
3. **USDC**: `SOLANA_MERCHANT_WALLET` = endereço da carteira que recebe. Em produção, use um RPC dedicado (`SOLANA_RPC_URL`, ex.: Helius/QuickNode) — o público tem limite baixo. Para testar em devnet: RPC de devnet + `SOLANA_USDC_MINT` do USDC de teste.

## NFT do influencer (Solana, opcional)

Na aba **NFT** do personagem (ao lado do Radar; `?aba=nft`), a pessoa pode mintar o influencer como um NFT na Solana (padrão **Metaplex Core**). O NFT fica na carteira dela e é **intransferível** (soulbound). As marcas que o influencer bate em views, curtidas, comentários, reposts, quotes e salvos viram **badges gravados no próprio NFT**. Código em [`lib/nft/`](lib/nft/); começa **só para admin** (área admin → "Em teste" → NFT do influencer).

**Fluxo**

1. **Vincular a carteira** (Phantom, Solflare, Backpack ou MetaMask): o servidor manda uma mensagem com um código de uso único (10 min, presa à conta e ao endereço) e a carteira assina. Não é transação e não custa nada. Vale a última prova: a mesma carteira não fica em duas contas.
2. **Mintar** (`POST /api/nft/mint`, planos pagos, **10 créditos**, declaração obrigatória registrada em `consentimentos`, personagem com a **arte do NFT** gerada): o **servidor** monta, assina e paga a transação; o usuário nunca assina transação e não precisa de SOL. Ordem que protege o dinheiro, em [`lib/nft/mint.ts`](lib/nft/mint.ts): confere tudo → assina → grava a linha (o índice único por personagem e rede barra o segundo clique) → **simula** (se a rede recusaria, para sem cobrar) → cobra → grava a assinatura e o último bloco válido → só então transmite. O resultado sai sempre de `conferirMint`, que olha a rede: finalizada → confirmado; recusada, ou vencida sem registro (com folga de 300 blocos, nova consulta e conferência de que a conta do NFT não existe) → falhou, com estorno. A regra está isolada em [`lib/nft/decisao.ts`](lib/nft/decisao.ts). O estorno marca a linha, lança no extrato e devolve o saldo **num comando só**: não sai em dobro nem pela metade. O débito (`debitar`, em [`lib/creditos.ts`](lib/creditos.ts)) também grava saldo e extrato num comando só.
3. **Badges** ([`lib/nft/badges.ts`](lib/nft/badges.ts)): uma escada de marcas por métrica, sobre o total acumulado do personagem em todas as redes. Nascem no banco (`nft_badges`), mesmo antes do mint, e são gravados no NFT depois (a escrita substitui a lista inteira, então repetir é seguro).

| Métrica | Degraus | Só com conta conectada (ou admin) | Sempre com admin |
|---|---|---|---|
| Views | 5 mil · 10 mil · 50 mil · 100 mil · 500 mil · 1 mi · 5 mi · 10 mi · 50 mi · 100 mi | de 100 mil | de 1 milhão |
| Curtidas | 100 · 200 · 1 mil · 2 mil · 10 mil · 20 mil · 100 mil · 200 mil · 1 mi · 2 mi | de 2 mil | de 20 mil |
| Comentários | 10 · 50 · 100 · 500 · 1 mil · 5 mil · 10 mil · 50 mil · 100 mil | de 100 | de 1 mil |
| Reposts | 10 · 20 · 100 · 200 · 1 mil · 2 mil · 10 mil · 20 mil · 100 mil · 200 mil | de 200 | de 2 mil |
| Salvos | 10 · 50 · 100 · 500 · 1 mil · 5 mil · 10 mil · 50 mil · 100 mil | de 100 | de 1 mil |
| Quotes | 10 · 50 · 100 · 500 · 1 mil · 5 mil · 10 mil | de 50 | de 500 |

Cada escada é a de views dividida pelo quanto a métrica rende por view em vídeo curto (pesquisa de 10/10/2026, com as fontes no desenho do fluxo): curtidas ÷ 50 (2 a 5% das views), comentários ÷ 1.000 (0,05 a 0,1%), reposts ÷ 500 (0,15 a 0,4%) e salvos ÷ 1.000. Salvos rendem 0,2 a 0,4% nas redes, mas o app nunca lê os do TikTok (só por link) e os do Instagram (só com a conta conectada) do mesmo personagem pelo mesmo caminho, então o que chega é perto de 0,1%. Assim o degrau de uma métrica é mais ou menos tão difícil quanto o degrau de views na mesma posição. Quotes só existem no X (1 a cada 10 mil views de lá), por isso a escada é mais curta: 10 mil quotes é o que 100 milhões de views no X rendem. Nenhuma escada começa abaixo de 10: marca de um dígito a própria pessoa bate com as contas dela, e badge gravado no NFT não se desfaz. São 55 badges ao todo.

Esperam aprovação na aba **NFT** do admin: as marcas altas de cada escada (`aprovacaoDe`, o degrau equivalente a 1 milhão de views); as marcas médias quando a conta não está conectada (`semConexaoDe`, o equivalente a 100 mil views); e os badges de uma leitura em que um post saltou fora do normal (100 vezes e pelo menos a marca `semConexaoDe` da métrica).

**O que existe na rede**

- **Coleção** `NIDO Influencers`, criada por [`scripts/nft-colecao.mjs`](scripts/nft-colecao.mjs), com `PermanentFreezeDelegate` congelado (autoridade = endereço da **raiz**) e `UpdateDelegate` com a chave de mint como delegada.
- **Um NFT por personagem em cada rede**: dono = carteira do usuário; nome; endereço dos metadados (`/api/nft/meta/<asset>`); plugin `AppData` (JSON) com o **hash da ficha** no dia do mint e os badges, em formato compacto: por métrica, o dia em que cada degrau da escada foi conquistado (`{"v":2,"ficha":"…","b":{"v":[20371,20380],"l":[20390]}}`). Como vale a **posição** do degrau, só se acrescentam degraus no fim de uma escada ou escadas novas.
- **Devnet e mainnet no mesmo banco**: cada linha de `nft_mints` guarda a rede em que nasceu, e o app só mexe nas linhas da rede em que está (`NFT_REDE`). O NFT de teste não impede o mint do mesmo personagem na mainnet, e um app em devnet não julga (nem estorna) um mint da mainnet.
- **Três chaves**, cada uma com um papel: **raiz** (multisig ou carteira fria, fora do servidor — só ela descongela os NFTs e revoga a chave de mint), **chave de mint** (`NFT_MINT_SECRET_KEY`: cria NFTs e paga as taxas) e **chave de badges** (`NFT_BADGE_SECRET_KEY`: só escreve o `AppData`). Não são a carteira de saques nem a que recebe pagamentos.
- Conferido contra o programa Core de verdade, por simulação, em devnet e mainnet (10/10/2026): `node scripts/nft-simular.mjs [--rede mainnet]`. O dono não transfere nem queima; chave qualquer não minta nem escreve badges; a chave de mint não escreve badges nem descongela; a raiz descongela e revoga; o catálogo inteiro de badges cabe numa transação. **Risco conhecido:** a chave de mint consegue trocar nome e endereço dos metadados dos NFTs até ser revogada — por isso fica com pouco saldo e a raiz fica fora do servidor.

**O que é público**

Na rede: nome, hash da ficha e badges (não dá para apagar — por isso a declaração). No JSON servido pelo app (`/api/nft/meta/<asset>`, sem login): bio curta, imagem, o site do app (`external_url`) e os traços nicho, arquétipo, forma, estilo e idioma. A imagem é a **arte do NFT**: o Retrato do personagem redesenhado pelo GPT Image (OpenAI, `OPENAI_API_KEY`; 1024×1024, qualidade média) no estilo da coleção (retrato quadrado, traço de quadrinho, fundo amarelo, sem texto; o prompt está em [`lib/nft/arte.ts`](lib/nft/arte.ts) e não cita nome de marca, porque o gerador escreve na imagem o nome que lê). Antes de mintar a pessoa **gera 5 opções** (`POST /api/nft/personagem/<id>/arte`, **30 créditos** pelas cinco; se não saírem as cinco, os créditos voltam e nada é guardado) e **escolhe uma** (`PUT` na mesma rota; tabela `nft_artes`: `opcoes` e `key`, a escolhida). Pode gerar outras cinco quantas vezes quiser, o que troca as opções e desfaz a escolha. Sem arte escolhida, o mint é recusado. **Depois do mint (ou com um mint em andamento) a imagem não muda mais**: gerar e escolher respondem 409. O Retrato de onde a arte sai é escolhido por [`lib/nft/imagem.ts`](lib/nft/imagem.ts): a capa escolhida, se for um retrato; senão o retrato mais recente. Referência enviada pela pessoa e outras imagens nunca viram a imagem pública. No mint é feita uma **cópia** da arte (`users/<id>/nft/<mint>.jpg`, poupada da limpeza do S3, como as opções) que sai por `/api/nft/meta/<asset>/imagem`, sem revelar a conta. Como o prompt manda preservar a identidade do retrato, personagem baseado em pessoa real vira a imagem dessa pessoa num registro público: a tela avisa antes de gerar, e a declaração do mint continua sendo a barreira. Modelo treinado, voz, prompts, referências e declarações **não** saem. Personagem apagado no app: o NFT continua existindo e aparece como arquivado, sem imagem nem bio.

Carteiras e explorers buscam esse JSON no endereço gravado no NFT (`NFT_BASE_URL`). Enquanto a versão com essas rotas não estiver publicada nesse endereço, o NFT aparece lá fora sem imagem, sem traços e sem site.

**Números que contam** (regras em [`lib/nft/views.ts`](lib/nft/views.ts), banco em [`lib/nft/views-server.ts`](lib/nft/views-server.ts))

- Em cada rede o personagem tem **uma conta só**: a conectada pelo bundle.social ou, sem conexão, a do **autor do primeiro post cadastrado por link** naquela rede (`nft_contas_rede.origem` = `conectada` ou `link`). Só os posts dessa conta contam; link de outra conta fica de fora, e a tela diz por quê. O @ escrito na ficha não prova nada.
- "Primeiro" é pela ordem de cadastro dos links: enquanto o link mais antigo de uma rede espera a leitura do autor, a rede fica sem conta.
- Cada conta de rede conta para **um personagem só**. **Conexão ganha do link:** se a conta estava com um personagem só pelo primeiro link e alguém a conecta (login na rede), ela passa para quem conectou; quem perdeu fica sem os posts dela, e os badges que os números restantes não sustentam são retirados (podem ser conquistados de novo). Conexão contra conexão, e link contra link, vale quem chegou primeiro. Não há tela para soltar uma conta: hoje é direto na tabela `nft_contas_rede`.
- O autor do post por link é lido da rede pelo Apify e guardado em `posts_agendados.autor` (`null` = ainda não lido; vazio = não deu para saber, e o post não conta). Posts sem autor são lidos quando o dono abre a aba NFT (`lerAutoresPendentes`): uma rodada por vez, até 6 posts por rodada, os mais antigos primeiro, e **no máximo três tentativas por post**, com 10 minutos entre uma e outra (`autor_tentativas`, `autor_tentado_em`). Cada tentativa é uma execução no Apify. Post do LinkedIn por link nunca tem autor (a página pública não informa): só conta com a conta conectada.
- O mesmo post não soma duas vezes (`nft_views_post`, chave = rede + id do post), nem pelo app e pelo link.
- **Números digitados à mão não contam.** LinkedIn por link soma zero views (a página pública não mostra impressões); pelo bundle.social as impressões contam.
- Seis métricas são somadas: views, curtidas, comentários, reposts, quotes e salvos. O total de cada uma é a soma da **maior** leitura de cada post, então não diminui. Badge concedido só é retirado quando a conta que dava os números é tomada por quem a conectou.
- Nem toda rede dá todo número: quotes só existem no X; salvos vêm do TikTok e do X por link, e do Instagram só com a conta conectada; reposts são os reposts do X e os compartilhamentos do TikTok e do LinkedIn (Instagram, só com a conta conectada). A tela mostra isso ao lado de cada escada.
- Recalcula ao abrir o Dashboard e a aba NFT (no máximo a cada 10 min por personagem; a cada consulta enquanto os autores estão sendo lidos) e no cron. Conta em que o recurso ainda está fechado ganha os badges no banco, mas não recebe o aviso no sino.

**Cron** `GET /api/cron/nft` (diário no `vercel.json`): fecha mints em aberto, relê as métricas do bundle.social das contas com NFT, recalcula os números e os badges, grava os badges pendentes e **confere a rede contra o banco** (dono, hash e badges; diferença vira `ALERTA` no log e os badges são reescritos). Se o RPC não estiver na rede de `NFT_REDE`, nada que dependa da rede roda. Para um mint incerto fechar em minutos com a página fechada, chame também de um cron externo a cada 5 min (mesmo esquema do `video-jobs`). Posts por link não são relidos pelo cron: cada leitura é uma execução no Apify, e ela acontece quando o dono abre o Dashboard.

**Travas**: teto de mints em 24h (`NFT_TETO_DIA`, padrão 200), saldo mínimo da chave de mint (`NFT_SALDO_MINIMO`, padrão 0,02 SOL — abaixo disso o mint para **antes** de cobrar), conferência de que o RPC está na rede de `NFT_REDE` e de que a coleção existe nela (antes de mintar, de julgar um mint e de gravar badges), limite de frequência nas rotas. Uma transação que a rede só "processou" ainda pode sumir: o app só age (estorno, badge dado como gravado) a partir de bloco confirmado.

**Custo**: 0,0040 SOL por mint (simulação em devnet e mainnet, 10/10/2026), quase tudo depósito de aluguel da conta do NFT. Os 10 créditos equivalem a US$ 0,10 de custo: só cobrem com o SOL abaixo de ~US$ 25. Acima disso a NIDO subsidia a diferença. Gravar badges custa a taxa da transação (0,00001 SOL) mais o aluguel dos bytes novos: com todos os badges do catálogo, cerca de 0,003 SOL a mais na vida do NFT.

Para ligar (comece em **devnet**):

1. Rodar `db/migrations/0028_nft.sql`, `0029_nft_metricas.sql`, `0030_nft_rede_autor.sql`, `0031_nft_arte.sql` e `0032_nft_arte_opcoes.sql` no Neon.
2. `node scripts/nft-colecao.mjs chaves` → pôr `NFT_MINT_SECRET_KEY` e `NFT_BADGE_SECRET_KEY` no `.env.local`, com `NFT_REDE=devnet`. Abastecer a chave de mint com SOL de teste em [faucet.solana.com](https://faucet.solana.com).
3. `node scripts/nft-colecao.mjs criar` → pôr `NFT_COLECAO`. `node scripts/nft-colecao.mjs conferir` confere raiz, congelamento (e que quem descongela é a raiz), delegação e saldo.
4. Reiniciar o app. A aba NFT aparece no personagem para as contas admin.
5. **Mainnet**: chaves novas (não reaproveitar as de devnet), `NFT_REDE=mainnet`, `criar --raiz <endereço do multisig>`, RPC dedicado em `NFT_RPC_URL`, `NFT_BASE_URL` em https. Os mints de devnet ficam no banco como estão e não atrapalham. Só depois dos testes de devnet listados no [PENDENCIAS.md](PENDENCIAS.md).

Não feito: trocar a carteira de um NFT já mintado (ele é intransferível; hoje o NFT fica na carteira em que nasceu), tela para soltar uma conta de rede presa a um personagem, registro do influencer como agente (Agent Registry da Metaplex), a linha do mint na página de planos (entra quando o recurso for aberto a todos).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Solana**: `@solana/web3.js` (pagamentos, saques) e **Metaplex Core** (`@metaplex-foundation/umi`, `mpl-core`) para o NFT do influencer; `@wallet-standard/app` para conectar a carteira no navegador — opcionais
- **Tailwind CSS 3** — tema claro, cream + verde, serif Fraunces + Inter + JetBrains Mono (design system do Treinadores de IA)
- **Zustand** + middleware `persist` → localStorage
- **@anthropic-ai/sdk** + **Zod** para as rotas de IA
- **@google/genai** (Nano Banana) + **sharp** para a geração de imagens — opcional
- **AWS S3** (`@aws-sdk/client-s3` + presigner) para arquivos — opcional
- **fal.ai** (`@fal-ai/client`, Kling O3 Edit, BiRefNet), **Runway** (`@runwayml/sdk`, Gen-4 / Veo) + **ffmpeg-static** para vídeo — opcionais
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
    videos/substituir/route.ts   POST — inicia troca de pessoa (Kling O3 ou Seedance 2.5 no fal.ai, em trechos) — job
    videos/criar/route.ts        POST — cria vídeo novo pelo Runway (Gen-4/Veo) — job
    videos/jobs/[id]/route.ts    GET — estado do job (finaliza se o serviço já terminou)
    videos/webhook/route.ts      POST — webhook do fal (URL assinada) → finaliza o job
    cron/video-jobs/route.ts     GET (cron) — finaliza jobs pendentes (Runway, webhooks perdidos)
    conta/creditos/route.ts      GET — plano, saldo e personagens da conta
    pagamentos/stripe/checkout   POST — abre o Checkout (assinatura mensal ou pagamento único)
    pagamentos/stripe/webhook    POST — eventos do Stripe (idempotente)
    pagamentos/stripe/portal     POST — portal do cliente (cancelar, cartão, faturas)
    pagamentos/usdc/route.ts     POST — cobrança USDC (link + QR; Solana Pay ou EIP-681)
    pagamentos/usdc/[id]         GET — confere o pagamento na blockchain · POST — confere o hash colado ou enviado pela carteira
    pagamentos/usdc/[id]/transacao  POST — Solana: monta a transferência para a carteira conectada assinar
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
  pagamentos/                    aplicar (compra → conta), stripe, usdc (Solana Pay), evm (Base/Arbitrum/BNB/Ethereum), enviados (acompanha o que a carteira enviou)
  carteira/                      carteira conectada no navegador para pagar em USDC: solana (Wallet Standard), evm (EIP-6963), index (estado e reconexão)
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
    openai-imagem.ts             GPT Image direto na OpenAI (quando há OPENAI_API_KEY)
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

> **Lista atual do que falta: [PENDENCIAS.md](PENDENCIAS.md)** (07/10/2026). O que vem abaixo é o histórico de 06/10 e tem itens já resolvidos.

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
- [ ] **Redirect URI de produção** no OAuth client: `https://aistudio.nido.global/api/auth/callback/google`.
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

## Área admin

`/app/admin` — só para os e-mails de [`lib/admin/acesso.ts`](lib/admin/acesso.ts) (ou da variável `ADMIN_EMAILS`, separados por vírgula). Para qualquer outra conta a página e as rotas `/api/admin/*` respondem 404. O link "Admin" aparece no menu da conta.

- **Visão geral**: usuários, planos pagos, receita (BRL e USD), créditos gastos (1 crédito ≈ US$ 0,01 de custo de IA), conteúdo criado e erros recentes.
- **Usuários**: busca e filtro por plano; a ficha mostra conta, extrato, pagamentos e personagens, e permite liberar/estender plano (cortesia), remover plano e dar/tirar créditos.
- **Pagamentos**: Stripe e USDC, com filtros, link da transação no explorer e carteira pagadora; aprovar à mão (aplica a compra) ou encerrar cobranças pendentes.
- **Uso de créditos**: gasto por recurso e modelo, quem mais gastou e de onde os créditos entraram (7, 30 ou 90 dias).

Toda ação do admin fica no extrato do usuário (`creditos_mov`) com `ref = admin:<e-mail>`.

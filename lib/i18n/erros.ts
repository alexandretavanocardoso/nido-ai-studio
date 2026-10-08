import { idiomaAtual, tx } from "./tx";

/**
 * Tradução das mensagens de erro que chegam do servidor (sempre em português).
 *   setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`))
 * Tenta, nesta ordem: texto exato, padrão com variáveis (números, nomes de
 * plano, de rede…), final conhecido ("Os créditos foram devolvidos.") e frase
 * por frase. O que não tiver tradução continua em português.
 */
export function txErro(pt: string): string {
  if (idiomaAtual() === "pt" || !pt) return pt;
  const msg = pt.replace(/\s+/g, " ").trim();
  const direto = inteira(msg);
  if (direto) return direto;
  for (const [final, en] of FINAIS)
    if (msg.endsWith(final) && msg.length > final.length)
      return `${txErro(msg.slice(0, -final.length))}${en}`;
  // Várias frases juntas (problemas do post, por exemplo): traduz cada uma.
  const frases = msg.replace(/([.!?])\s+(?=[A-ZÀ-Ú])/g, "$1\n").split("\n");
  if (frases.length > 1) return frases.map((f) => inteira(f) ?? f).join(" ");
  return pt;
}

function inteira(msg: string): string | null {
  const exato = ERROS_EN[msg] ?? tx(msg);
  if (exato !== msg) return exato;
  for (const [padrao, en] of PADROES) {
    const m = msg.match(padrao);
    if (m) return typeof en === "string" ? preencher(en, m) : en(m);
  }
  return null;
}

/** Troca $1, $2… pelos trechos capturados. */
function preencher(en: string, m: RegExpMatchArray): string {
  return en.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
}

/** "1,5 GB" → "1.5 GB". */
const ponto = (n: string) => n.replace(",", ".");

const SEGUIDAS: Record<string, string> = {
  chamadas: "requests",
  pedidos: "requests",
  imagens: "images",
  gerações: "generations",
  edições: "edits",
  buscas: "searches",
};

const FALHA_AO: Record<string, string> = {
  enviar: "upload",
  gerar: "generate",
  editar: "edit",
  carregar: "load",
  "preparar envio": "prepare the upload",
};

/** Trecho somado pelo servidor depois da mensagem principal. */
const FINAIS: Array<[string, string]> = [
  [" Os créditos foram devolvidos.", " Your credits were refunded."],
  [
    " Créditos devolvidos. Tente outra foto ou marque a pessoa de novo.",
    " Credits refunded. Try another photo or mark the person again.",
  ],
];

type Padrao = [RegExp, string | ((m: RegExpMatchArray) => string)];

const PADROES: Padrao[] = [
  // Limites de uso
  [
    /^Muit[ao]s (\S+) seguid[ao]s\. Tente (?:de novo )?em (\d+)s\.$/,
    (m) =>
      `Too many ${SEGUIDAS[m[1]] ?? "requests"} in a row. Try again in ${m[2]}s.`,
  ],
  [
    /^Créditos insuficientes: esta geração custa (\S+) e você tem (\S+)\. Veja os planos e pacotes\.$/,
    "Not enough credits: this generation costs $1 and you have $2. See the plans and packs.",
  ],
  [
    /^Você atingiu o limite de (\d+) imagens por dia\. Libera em ~(\d+)h\.$/,
    "You've reached the limit of $1 images per day. It resets in ~$2h.",
  ],
  [
    /^(?:Esse vídeo passaria|Passaria) do limite de (\d+)s de vídeo por dia\. Libera em ~(\d+)h\.$/,
    "This would go over the limit of $1s of video per day. It resets in ~$2h.",
  ],
  [
    /^Você já tem (\d+) (imagem|imagens|vídeo|vídeos) sendo gerad[ao]s?\. O plano (.+) permite (\d+) ao mesmo tempo — aguarde terminar ou faça upgrade\.$/,
    (m) => {
      const o = m[2].startsWith("imagem") ? "image" : "video";
      const quantos = m[1] === "1" ? `1 ${o}` : `${m[1]} ${o}s`;
      return `You already have ${quantos} being generated. The ${m[3]} plan allows ${m[4]} at a time — wait for it to finish or upgrade.`;
    },
  ],
  [
    /^Sem espaço: (\S+) GB de (\S+) GB usados no plano (.+)\. Remova vídeos e use "Liberar espaço" na página de planos, ou faça upgrade\.$/,
    (m) =>
      `Out of space: ${ponto(m[1])} GB of ${ponto(m[2])} GB used on the ${m[3]} plan. Remove videos and use "${tx("Liberar espaço")}" on the plans page, or upgrade.`,
  ],

  // Planos
  [/^Este modelo não está no plano (.+)\.$/, "This model isn't in the $1 plan."],
  [
    /^O plano (.+) aceita vídeos de até (\d+)s \(este tem (\d+)s\)\.$/,
    "The $1 plan accepts videos up to $2s (this one is $3s).",
  ],
  [
    /^A remoção com IA aceita vídeos de até (\d+)s \(este tem (\d+)s\)\.$/,
    "AI removal accepts videos up to $1s (this one is $2s).",
  ],

  // Vídeo e arquivos
  [
    /^Aprove pelo menos (\d+) imagens diferentes\.$/,
    "Approve at least $1 different images.",
  ],
  [
    /^Duração inválida para (.+): use (.+)s\.$/,
    "Invalid duration for $1: use $2s.",
  ],
  [
    /^Vídeo com (\d+)s\. O máximo é (\d+)s — corte antes de enviar\.$/,
    "This video is $1s long. The maximum is $2s — trim it before uploading.",
  ],
  [
    /^Vídeo com (\d+)s — o máximo é (\d+)s\.$/,
    "This video is $1s long — the maximum is $2s.",
  ],
  [
    /^O vídeo precisa ter pelo menos (\d+)s\.$/,
    "The video must be at least $1s long.",
  ],
  [/^Vídeo maior que (\S+) minutos\.$/, "Video longer than $1 minutes."],
  [/^Formato não aceito: (.+)\.$/, "Format not accepted: $1."],
  [/^Arquivo maior que (\d+) MB\.$/, "File larger than $1 MB."],
  [
    /^Não consegui buscar o vídeo \(Apify HTTP (\d+)\)\.$/,
    "Couldn't fetch the video (Apify HTTP $1).",
  ],
  [/^Não consegui pegar o vídeo: (.+)$/, "Couldn't get the video: $1"],
  [
    /^O vídeo não pôde ser baixado \(HTTP (\d+)\)\. O link pode ter expirado\.$/,
    "The video couldn't be downloaded (HTTP $1). The link may have expired.",
  ],

  // Pagamento e saque
  [
    /^Transação não encontrada na rede (.+)\. Confira se pagou nesta rede — ou, se acabou de enviar, aguarde alguns segundos e tente de novo\.$/,
    "Transaction not found on the $1 network. Check that you paid on this network — or, if you just sent it, wait a few seconds and try again.",
  ],
  [
    /^Valor enviado: (\S+) USDC\. Esta cobrança é de exatamente (\S+) USDC\.$/,
    "Amount sent: $1 USDC. This charge is for exactly $2 USDC.",
  ],
  [
    /^Não consegui falar com a rede (.+) agora\. Tente outra rede ou de novo em instantes\.$/,
    "Couldn't reach the $1 network right now. Try another network, or try again in a moment.",
  ],
  [/^O saque mínimo é de (\S+) (\S+)\.$/, "The minimum withdrawal is $1 $2."],

  // Publicação
  [
    /^Agende para no máximo (\d+) dias\.$/,
    "Schedule up to $1 days ahead at most.",
  ],
  [/^Conecte antes: (.+)\.$/, "Connect first: $1."],
  [/^(.+) precisa de um vídeo ou imagem\.$/, "$1 needs a video or an image."],
  [/^(.+) aceita só vídeo\.$/, "$1 only accepts video."],
  [
    /^O texto passa do limite do (.+) \((\d+)\/(\d+) caracteres\)\.$/,
    "The text is over the $1 limit ($2/$3 characters).",
  ],
  [
    /^Título do YouTube com mais de (\d+) caracteres\.$/,
    "YouTube title longer than $1 characters.",
  ],
  [
    /^Limite do plano do bundle\.social atingido(?:: (.+)|\.)$/,
    (m) => `bundle.social plan limit reached${m[1] ? `: ${m[1]}` : "."}`,
  ],

  // Serviços de IA
  [/^Falha \(HTTP (\d+)\)\.$/, "Failed (HTTP $1)."],
  [
    /^Falha ao baixar a imagem gerada \(HTTP (\d+)\)\.$/,
    "Failed to download the generated image (HTTP $1).",
  ],
  [
    /^Falha ao (.+) \(HTTP (\d+)\)\.$/,
    (m) =>
      FALHA_AO[m[1]]
        ? `Failed to ${FALHA_AO[m[1]]} (HTTP ${m[2]}).`
        : `Failed (HTTP ${m[2]}).`,
  ],
  [/^O S3 recusou o envio \(HTTP (\d+)\)\.$/, "S3 rejected the upload (HTTP $1)."],
  [/^Falha no fal\.ai \(HTTP (\d+)\)\.$/, "fal.ai failed (HTTP $1)."],
  [/^Falha no Runway \(HTTP (\d+)\)\.$/, "Runway failed (HTTP $1)."],
  [
    /^Falha na OpenAI \(HTTP (\d+)\)(?:: (.+)|\.)$/,
    (m) => `OpenAI failed (HTTP ${m[1]})${m[2] ? `: ${m[2]}` : "."}`,
  ],
  [
    /^O fal recusou a entrada(?:: (.+)|\.)$/,
    (m) => `fal rejected the input${m[1] ? `: ${m[1]}` : "."}`,
  ],
  [/^A ElevenLabs recusou a entrada: (.+)$/, "ElevenLabs rejected the input: $1"],
  [/^O Runway recusou a entrada: (.+)$/, "Runway rejected the input: $1"],
  [/^O Runway não aceitou a entrada: (.+)$/, "Runway didn't accept the input: $1"],
  [/^O Runway falhou: (.+)$/, "Runway failed: $1"],
  [
    /^O Gemini não devolveu imagem \((.+?)\)\.(?: Resposta: (.+))?$/,
    (m) =>
      `Gemini returned no image (${m[1]}).${m[2] ? ` Response: ${m[2]}` : ""}`,
  ],
  [
    /^A IA respondeu em um formato que não bateu com o esperado\. Último erro: (.+)$/,
    "The AI answered in a format that didn't match what was expected. Last error: $1",
  ],
];

/** Mensagens fixas do servidor, indexadas pelo texto em português. */
const ERROS_EN: Record<string, string> = {
  // Conta e pedido
  "Entre na sua conta para usar a IA.": "Sign in to your account to use the AI.",
  "Entre na sua conta para gerar imagens.":
    "Sign in to your account to generate images.",
  "Entre na sua conta para trocar pessoas.":
    "Sign in to your account to swap people.",
  "Entre na sua conta para enviar arquivos.":
    "Sign in to your account to upload files.",
  "Corpo inválido.": "Invalid request.",
  "Corpo da requisição inválido.": "Invalid request.",
  "Configuração inválida.": "Invalid settings.",
  "Erro inesperado.": "Unexpected error.",
  "Indisponível.": "Unavailable.",
  "Não encontrado.": "Not found.",

  // Serviço não configurado
  "Chave da Anthropic não configurada.": "Anthropic key not configured.",
  "Chave da Anthropic não configurada no servidor.":
    "Anthropic key not configured on the server.",
  "Nenhuma chave da Anthropic configurada no servidor.":
    "No Anthropic key configured on the server.",
  "A IA ainda não está configurada neste servidor. Peça pro admin preencher a chave da Anthropic.":
    "The AI isn't configured on this server yet. Ask the admin to fill in the Anthropic key.",
  "Chave do Gemini não configurada no servidor.":
    "Gemini key not configured on the server.",
  "GEMINI_API_KEY não configurada no servidor.":
    "GEMINI_API_KEY not configured on the server.",
  "OPENAI_API_KEY não configurada.": "OPENAI_API_KEY not configured.",
  "Modelo indisponível: FAL_KEY não configurada no servidor.":
    "Model unavailable: FAL_KEY not configured on the server.",
  "Nano Banana indisponível: GEMINI_API_KEY não configurada.":
    "Nano Banana unavailable: GEMINI_API_KEY not configured.",
  "Nenhum gerador de imagem configurado.": "No image generator configured.",
  "Voz não configurada (ELEVENLABS_API_KEY).":
    "Voice not configured (ELEVENLABS_API_KEY).",
  "Treino não configurado (FAL_KEY).": "Training not configured (FAL_KEY).",
  "Criação de vídeo não configurada (RUNWAYML_API_SECRET).":
    "Video creation not configured (RUNWAYML_API_SECRET).",
  "Troca de vídeo não configurada (FAL_KEY).":
    "Video swap not configured (FAL_KEY).",
  "Remoção com IA não configurada (FAL_KEY).":
    "AI removal not configured (FAL_KEY).",
  "Vídeo por link não configurado (FAL_KEY).":
    "Video by link not configured (FAL_KEY).",
  "Busca por link não configurada (APIFY_TOKEN).":
    "Link lookup not configured (APIFY_TOKEN).",
  "Armazenamento não configurado.": "Storage not configured.",
  "Publicação não configurada.": "Publishing not configured.",
  "Publicação não configurada (BUNDLE_SOCIAL).":
    "Publishing not configured (BUNDLE_SOCIAL).",
  "Pagamento em USDC não configurado.": "USDC payment not configured.",
  "Pagamento pelo Stripe não configurado.": "Stripe payment not configured.",
  "Indicações não configuradas.": "Referrals not configured.",
  "Saque pelo Stripe não configurado.": "Stripe withdrawal not configured.",
  "O radar precisa de login e da IA de texto configurados.":
    "The radar needs sign-in and the text AI configured.",
  "O radar precisa do banco e da IA de texto configurados.":
    "The radar needs the database and the text AI configured.",
  "A troca de pessoa em foto precisa de login e armazenamento configurados.":
    "Swapping a person in a photo needs sign-in and storage configured.",
  "Runway não configurado no servidor.": "Runway not configured on the server.",
  "fal.ai não configurado no servidor.": "fal.ai not configured on the server.",

  // Planos
  "A qualidade Pro está disponível a partir do plano Creator.":
    "Pro quality is available from the Creator plan up.",
  "A troca de pessoa em vídeo está disponível a partir do plano Starter.":
    "Swapping a person in video is available from the Starter plan up.",
  "A remoção de legenda com IA está disponível a partir do plano Starter.":
    "AI caption removal is available from the Starter plan up.",
  "Treinar persona está disponível a partir do plano Creator.":
    "Persona training is available from the Creator plan up.",
  "Publicar e agendar nas redes está disponível a partir do plano Starter.":
    "Publishing and scheduling to social networks is available from the Starter plan up.",
  "A voz do personagem está disponível a partir do plano Starter.":
    "The character's voice is available from the Starter plan up.",
  "O motor Premium (Seedance 2.5) está disponível a partir do plano Creator.":
    "The Premium engine (Seedance 2.5) is available from the Creator plan up.",
  "Criar vídeo está disponível a partir do plano Starter.":
    "Creating video is available from the Starter plan up.",
  "Vídeo com áudio está disponível no plano Studio.":
    "Video with audio is available on the Studio plan.",

  // Escrita com IA
  "O nome do personagem é escolhido por você — a IA não sugere nome.":
    "You choose the character's name — the AI doesn't suggest names.",
  "Escreva pelo menos uma frase sobre o personagem.":
    "Write at least one sentence about the character.",
  "Escreva o tema (ou cole o comentário a responder).":
    "Write the topic (or paste the comment to reply to).",
  "A IA voltou vazia. Tente de novo.": "The AI came back empty. Try again.",
  "A resposta da IA ficou grande demais e saiu incompleta. Tente de novo.":
    "The AI's answer was too long and came out incomplete. Try again.",
  "ANTHROPIC_WORKSPACE_ID inválido: use o ID do workspace que começa com wrkspc_ (Console → Settings → Workspaces).":
    "Invalid ANTHROPIC_WORKSPACE_ID: use the workspace ID that starts with wrkspc_ (Console → Settings → Workspaces).",
  "A chave da Anthropic não está ligada a um workspace: adicione ANTHROPIC_WORKSPACE_ID no .env ou crie a chave dentro de um workspace.":
    "The Anthropic key isn't tied to a workspace: add ANTHROPIC_WORKSPACE_ID to .env or create the key inside a workspace.",
  "Chave da Anthropic inválida. Confira ANTHROPIC_API_KEY.":
    "Invalid Anthropic key. Check ANTHROPIC_API_KEY.",
  "Modelo da Anthropic não encontrado. Confira ANTHROPIC_MODEL.":
    "Anthropic model not found. Check ANTHROPIC_MODEL.",
  "Falha ao chamar a Anthropic. Tente de novo em instantes.":
    "The call to Anthropic failed. Try again in a moment.",

  // Radar
  "Não consegui montar o radar agora.": "Couldn't build the radar right now.",
  "Não consegui montar o radar agora. Tente de novo em instantes.":
    "Couldn't build the radar right now. Try again in a moment.",
  "Não consegui pesquisar as notícias agora. Tente de novo em instantes.":
    "Couldn't search the news right now. Try again in a moment.",
  "O radar veio num formato inesperado. Tente de novo.":
    "The radar came back in an unexpected format. Try again.",
  "Nicho inválido.": "Invalid niche.",

  // Imagens
  "Para o retrato, selecione a imagem do card de referência.":
    "For the portrait, select the reference card image.",
  "Referência de imagem inválida.": "Invalid image reference.",
  "Referência precisa ser uma imagem JPEG, PNG ou WebP.":
    "The reference must be a JPEG, PNG or WebP image.",
  "No máximo 4 imagens de referência.": "At most 4 reference images.",
  "No máximo 3 pessoas por foto.": "At most 3 people per photo.",
  "Este personagem ainda não tem persona treinada. Treine na etapa Visual.":
    "This character doesn't have a trained persona yet. Train it in the Visual step.",
  "Persona treinada não encontrada.": "Trained persona not found.",
  "Imagem inválida.": "Invalid image.",
  "Imagem não encontrada.": "Image not found.",
  "Escolha a imagem do personagem.": "Choose the character's image.",
  "O fal não devolveu imagem.": "fal returned no image.",
  "A OpenAI não devolveu imagem.": "OpenAI returned no image.",
  "A OpenAI recusou esta imagem pelas regras de conteúdo. Ajuste a descrição e tente de novo.":
    "OpenAI refused this image under its content rules. Adjust the description and try again.",
  "Chave da OpenAI inválida. Confira OPENAI_API_KEY.":
    "Invalid OpenAI key. Check OPENAI_API_KEY.",
  "Sem créditos na OpenAI. Adicione saldo na conta.":
    "No credits on OpenAI. Add balance to the account.",
  "A conta da OpenAI não tem acesso ao GPT Image (verifique a organização no painel da OpenAI).":
    "The OpenAI account has no access to GPT Image (verify the organization in the OpenAI dashboard).",
  "A OpenAI está limitando os pedidos. Tente de novo em instantes.":
    "OpenAI is rate limiting requests. Try again in a moment.",
  "A chave do Gemini está no plano gratuito, que não inclui geração de imagem. Ative o faturamento no Google AI Studio.":
    "The Gemini key is on the free tier, which doesn't include image generation. Enable billing in Google AI Studio.",
  "Limite de uso do Gemini atingido. Tente de novo em alguns minutos.":
    "Gemini usage limit reached. Try again in a few minutes.",
  "Chave do Gemini inválida. Confira GEMINI_API_KEY.":
    "Invalid Gemini key. Check GEMINI_API_KEY.",
  "A chave do Gemini não tem permissão para este modelo.":
    "The Gemini key has no permission for this model.",
  "Modelo de imagem do Gemini não encontrado. Confira GEMINI_IMAGE_MODEL.":
    "Gemini image model not found. Check GEMINI_IMAGE_MODEL.",
  "Falha ao chamar o Gemini. Tente de novo em instantes.":
    "The call to Gemini failed. Try again in a moment.",

  // Persona
  "Referência não encontrada.": "Reference not found.",
  "Nenhuma variação foi gerada. Os créditos foram devolvidos.":
    "No variation was generated. Your credits were refunded.",
  "Não consegui gerar o conjunto. Os créditos foram devolvidos.":
    "Couldn't generate the set. Your credits were refunded.",
  "Marque a declaração para continuar.": "Tick the statement to continue.",
  "Este personagem já está sendo treinado. Aguarde terminar.":
    "This character is already being trained. Wait for it to finish.",
  "O treino não devolveu o modelo.": "Training returned no model.",

  // Voz
  "Voz não encontrada.": "Voice not found.",
  "Escreva o que o personagem vai falar.": "Write what the character will say.",
  "Envie pelo menos uma amostra de voz (1 a 3 arquivos).":
    "Upload at least one voice sample (1 to 3 files).",
  "Amostra não encontrada.": "Sample not found.",
  "Marque a declaração para clonar a voz.":
    "Tick the statement to clone the voice.",
  "A ElevenLabs não devolveu nenhuma voz para essa descrição.":
    "ElevenLabs returned no voice for that description.",
  "Chave da ElevenLabs inválida. Confira ELEVENLABS_API_KEY.":
    "Invalid ElevenLabs key. Check ELEVENLABS_API_KEY.",
  "Limite ou créditos da ElevenLabs esgotados. Confira o plano da conta.":
    "ElevenLabs limit or credits used up. Check the account's plan.",
  "Falha na ElevenLabs.": "ElevenLabs failed.",

  // Vídeo
  "Descreva a cena.": "Describe the scene.",
  "Informe o vídeo (arquivo ou link).": "Provide the video (file or link).",
  "Arquivo não encontrado.": "File not found.",
  "Vídeo não encontrado.": "Video not found.",
  "Job não encontrado.": "Job not found.",
  "Marque a declaração de direito de uso do vídeo.":
    "Tick the statement that you have the right to use the video.",
  "Link expirado. Busque o vídeo de novo.":
    "Link expired. Look up the video again.",
  "Escreva o texto da nova legenda.": "Write the text of the new caption.",
  "Não consegui editar o vídeo.": "Couldn't edit the video.",
  "Não consegui colocar a fala no vídeo.":
    "Couldn't add the voice-over to the video.",
  "Não consegui ler o vídeo.": "Couldn't read the video.",
  "O serviço não terminou a tempo.": "The service didn't finish in time.",
  "A IA não devolveu um dos trechos.": "The AI didn't return one of the segments.",
  "O fal não devolveu vídeo.": "fal returned no video.",
  "Sem créditos no fal.ai. Adicione saldo na conta.":
    "No credits on fal.ai. Add balance to the account.",
  "Chave do fal inválida ou sem permissão. Confira FAL_KEY.":
    "Invalid fal key, or it lacks permission. Check FAL_KEY.",
  "O motor Premium (Seedance) recusa vídeos em que aparece o rosto de uma pessoa real. Use o motor Padrão (Kling O1) para este vídeo.":
    "The Premium engine (Seedance) refuses videos showing a real person's face. Use the Standard engine (Kling O1) for this video.",
  "Falha no fal.ai.": "fal.ai failed.",
  "O Runway não devolveu vídeo.": "Runway returned no video.",
  "Geração cancelada no Runway.": "Generation cancelled on Runway.",
  "O Runway bloqueou a geração pela moderação de conteúdo.":
    "Runway blocked the generation through content moderation.",
  "Chave do Runway inválida. Confira RUNWAYML_API_SECRET.":
    "Invalid Runway key. Check RUNWAYML_API_SECRET.",
  "Sem créditos na API do Runway. Adicione saldo em dev.runwayml.com.":
    "No credits on the Runway API. Add balance at dev.runwayml.com.",
  "Limite de uso do Runway atingido. Tente em alguns minutos.":
    "Runway usage limit reached. Try again in a few minutes.",
  "Falha no Runway.": "Runway failed.",

  // Vídeo por link
  "Cole um link válido.": "Paste a valid link.",
  "Link não suportado. Use TikTok, Instagram (reel/post), YouTube Shorts ou um link direto de .mp4.":
    "Link not supported. Use TikTok, Instagram (reel/post), YouTube Shorts or a direct .mp4 link.",
  "Sem créditos no Apify.": "No credits on Apify.",
  "A busca do vídeo demorou demais. Tente de novo.":
    "Looking up the video took too long. Try again.",
  "Não achei o vídeo. Para YouTube, só Shorts públicos são aceitos.":
    "Couldn't find the video. For YouTube, only public Shorts are accepted.",
  "Não achei o vídeo nesse link (é público? é um vídeo?).":
    "Couldn't find the video at that link (is it public? is it a video?).",
  "O link redireciona vezes demais.": "The link redirects too many times.",
  "Vídeo grande demais (máx. 300 MB).": "Video too large (max 300 MB).",
  "O link não aponta para um arquivo de vídeo.":
    "The link doesn't point to a video file.",
  "Link inválido.": "Invalid link.",
  "Só links http(s) são aceitos.": "Only http(s) links are accepted.",
  "Links com usuário e senha não são aceitos.":
    "Links with a username and password aren't accepted.",
  "Só as portas padrão (80 e 443) são aceitas.":
    "Only the standard ports (80 and 443) are accepted.",
  "Não foi possível achar o servidor do link.":
    "Couldn't find the link's server.",
  "Este link aponta para um endereço que não é público.":
    "This link points to an address that isn't public.",

  // Envio de arquivo
  "Falha de rede ao enviar o arquivo (confira o CORS do bucket).":
    "Network failure while uploading the file (check the bucket's CORS).",
  "Não foi possível ler a imagem.": "Couldn't read the image.",

  // Publicação
  "Escolha pelo menos uma rede.": "Choose at least one network.",
  "Escreva um texto ou escolha uma mídia.": "Write some text or choose media.",
  "O LinkedIn precisa de texto.": "LinkedIn needs text.",
  "O YouTube precisa de um título.": "YouTube needs a title.",
  "Mídia não encontrada.": "Media not found.",
  "Post não encontrado.": "Post not found.",
  "Só posts do backlog podem ser agendados aqui.":
    "Only backlog posts can be scheduled here.",
  "Só posts do backlog podem ser editados.": "Only backlog posts can be edited.",
  "Escolha uma data no futuro.": "Pick a date in the future.",
  "Este post não pode ser reagendado.": "This post can't be rescheduled.",
  "Não consegui mover o post.": "Couldn't move the post.",
  "Não consegui carregar as métricas.": "Couldn't load the metrics.",
  "Informe um número de views válido.": "Enter a valid number of views.",
  "Link não suportado. Use o link do post no Instagram, TikTok, YouTube, X ou LinkedIn.":
    "Unsupported link. Use the post link on Instagram, TikTok, YouTube, X or LinkedIn.",
  "A leitura do post demorou demais. Tente de novo.":
    "Reading the post took too long. Try again.",
  "Não achei o post nesse link (ele é público?).":
    "Couldn't find the post at that link (is it public?).",
  "Esse link já está no Dashboard.":
    "That link is already on the Dashboard.",
  "Não consegui ler o post.":
    "Couldn't read the post.",
  "Personagem não encontrado.":
    "Character not found.",
  "O plano atual do bundle.social não inclui analytics; as métricas ficam zeradas até o upgrade.":
    "The current bundle.social plan doesn't include analytics; metrics stay at zero until you upgrade.",
  "Só dá pra cancelar posts que ainda não foram publicados.":
    "You can only cancel posts that haven't been published yet.",
  "Conecte as redes deste influencer primeiro.":
    "Connect this influencer's networks first.",
  "Chave do bundle.social inválida (BUNDLE_SOCIAL).":
    "Invalid bundle.social key (BUNDLE_SOCIAL).",
  "Muitas chamadas ao bundle.social. Tente de novo em instantes.":
    "Too many calls to bundle.social. Try again in a moment.",
  "Falha ao falar com o bundle.social.": "Couldn't reach bundle.social.",

  // Pagamento
  "Plano, pacote ou quantidade inválida (mínimo 100 créditos).":
    "Invalid plan, pack or amount (minimum 100 credits).",
  "Rede não disponível para pagamento em USDC.":
    "Network not available for USDC payment.",
  "Não consegui abrir o pagamento. Tente de novo.":
    "Couldn't open the payment. Try again.",
  "Nenhuma compra pelo Stripe nesta conta.":
    "No Stripe purchase on this account.",
  "Não consegui consultar a rede agora. Tente de novo em instantes.":
    "Couldn't query the network right now. Try again in a moment.",
  "Valor da cobrança em disputa; tente de novo.":
    "The charge amount is contended; try again.",
  "Muitas cobranças em aberto nesta rede; tente outra rede.":
    "Too many open charges on this network; try another network.",
  "Pagamento não encontrado.": "Payment not found.",
  "Cole o hash da transação (0x… com 64 caracteres) ou o link dela no explorer.":
    "Paste the transaction hash (0x… with 64 characters) or its explorer link.",
  "Na Solana a confirmação é automática.":
    "On Solana, confirmation is automatic.",
  "Esta transação já foi usada em outro pagamento.":
    "This transaction was already used for another payment.",
  "Esta transação falhou na rede (status de erro).":
    "This transaction failed on the network (error status).",
  "Transação encontrada — aguardando confirmações da rede. Tente de novo em instantes.":
    "Transaction found — waiting for network confirmations. Try again in a moment.",
  "Esta transação não enviou USDC para a carteira da NIDO.":
    "This transaction didn't send USDC to NIDO's wallet.",
  "Não consegui ler o horário da transação. Tente de novo.":
    "Couldn't read the transaction's time. Try again.",
  "Esta transação é anterior à cobrança — use a transação feita para este pagamento.":
    "This transaction is older than the charge — use the transaction made for this payment.",
  "Esta transação foi feita depois que a cobrança expirou.":
    "This transaction was made after the charge expired.",

  // Indicações
  "Informe o código.": "Enter the code.",
  "Você já escolheu o seu código.": "You've already chosen your code.",
  "Este código já está em uso. Tente outro.":
    "This code is already in use. Try another.",
  "O código precisa de pelo menos 3 caracteres.":
    "The code needs at least 3 characters.",
  "O código pode ter no máximo 24 caracteres.":
    "The code can have at most 24 characters.",
  "Use só letras sem acento, números, hífen e sublinhado, começando por letra ou número.":
    "Use only unaccented letters, numbers, hyphens and underscores, starting with a letter or a number.",
  "Este código não está disponível.": "This code isn't available.",
  "Não foi possível criar o código de indicação.":
    "Couldn't create the referral code.",
  "Pedido de saque inválido.": "Invalid withdrawal request.",
  "Muitos pedidos de saque seguidos. Tente de novo em um minuto.":
    "Too many withdrawal requests in a row. Try again in a minute.",
  "Não há saldo disponível para sacar.": "There's no balance available to withdraw.",
  "Conecte sua conta do Stripe primeiro.": "Connect your Stripe account first.",
  "Conecte sua conta do Stripe antes de sacar.":
    "Connect your Stripe account before withdrawing.",
  "Termine o cadastro no Stripe para abrir o painel.":
    "Finish your Stripe onboarding to open the dashboard.",
  "Termine o cadastro da sua conta no Stripe para sacar.":
    "Finish your Stripe account onboarding to withdraw.",
  "Não foi possível abrir o cadastro no Stripe. Tente de novo em instantes.":
    "Couldn't open the Stripe onboarding. Try again in a moment.",
  "O Stripe não concluiu a transferência. O saldo continua disponível; tente de novo mais tarde.":
    "Stripe didn't complete the transfer. Your balance is still available; try again later.",
  "O saque em USDC não está disponível nesta rede.":
    "USDC withdrawal isn't available on this network.",
  "Endereço de carteira inválido para esta rede.":
    "Invalid wallet address for this network.",
  "Este valor passa do limite do saque automático. Fale com o suporte para receber.":
    "This amount is over the automatic withdrawal limit. Contact support to receive it.",
  "O limite diário de saques em USDC foi atingido. O saldo continua disponível; tente de novo amanhã.":
    "The daily USDC withdrawal limit was reached. Your balance is still available; try again tomorrow.",
  "O saque em USDC está indisponível no momento. O saldo continua disponível; tente de novo mais tarde.":
    "USDC withdrawal is unavailable right now. Your balance is still available; try again later.",
  "A rede recusou a transferência. O saldo continua disponível; tente de novo mais tarde.":
    "The network refused the transfer. Your balance is still available; try again later.",

  // Importar ficha
  "O arquivo não é um JSON válido.": "The file isn't valid JSON.",
  "Este arquivo não é um personagem do NIDO Studio. Use o JSON de “Exportar ficha → Dados (JSON)”.":
    "This file isn't a NIDO Studio character. Use the JSON from “Export profile → Data (JSON)”.",

  // Colar a resposta da IA
  "Cole aqui a resposta que a IA te devolveu.":
    "Paste the answer the AI gave you here.",
  "Não consegui ler o JSON. Copie o bloco inteiro da resposta da IA (do { ao }) e cole de novo.":
    "Couldn't read the JSON. Copy the whole block from the AI's answer (from { to }) and paste it again.",
  "A resposta precisa ser um objeto JSON com as seções da ficha.":
    "The answer must be a JSON object with the profile's sections.",
  "O JSON não trouxe nenhum campo reconhecido. Confira se você usou o prompt gerado pelo site.":
    "The JSON had no recognized field. Check that you used the prompt generated by the site.",

  // Falhas mostradas quando o servidor não manda mensagem
  "Falha. Tente de novo.": "Failed. Try again.",
  "Falha ao sugerir.": "Couldn't suggest.",
  "Falha ao regenerar.": "Couldn't regenerate.",
  "Falha ao checar.": "Couldn't check.",
  "Falha ao expandir. Tente de novo.": "Couldn't expand. Try again.",
  "Não consegui cancelar.": "Couldn't cancel.",
  "Não consegui abrir o pagamento.": "Couldn't open the payment.",
  "Não consegui abrir o portal.": "Couldn't open the portal.",
  "Não consegui conferir a transação.": "Couldn't check the transaction.",
  "Não consegui criar a cobrança.": "Couldn't create the charge.",
  "Não consegui liberar espaço.": "Couldn't free up space.",
};

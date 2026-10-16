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
  // Sombra de vídeo: links da Twitch e do Kick (worker/sombra/vod.ts)
  [/^A Twitch não respondeu \((.+)\)\.$/, "Twitch didn't respond ($1)."],
  [
    /^O Kick recusou a busca do vídeo \(HTTP (\d+)\)\. Baixe e envie o arquivo\.$/,
    "Kick refused to fetch the video (HTTP $1). Download it and upload the file.",
  ],
  [/^Não consegui abrir o vídeo \(HTTP (\d+)\)\.$/, "Couldn't open the video (HTTP $1)."],
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
    /^O vídeo de referência tem (\d+)s — o máximo é (\d+)s\.$/,
    "The reference video is $1s long — the maximum is $2s.",
  ],
  [
    /^O vídeo precisa ter pelo menos (\d+)s\.$/,
    "The video must be at least $1s long.",
  ],
  [/^Vídeo maior que (\S+) minutos\.$/, "Video longer than $1 minutes."],
  [
    /^O trecho precisa ter pelo menos (\S+)s\.$/,
    (m) => `The clip must be at least ${ponto(m[1])}s long.`,
  ],
  [
    /^O trecho pode ter até (\S+) minutos\.$/,
    "The clip can be up to $1 minutes long.",
  ],
  [/^Formato não aceito: (.+)\.$/, "Format not accepted: $1."],
  [/^Arquivo maior que (\d+) MB\.$/, "File larger than $1 MB."],
  [
    /^Não consegui buscar o vídeo \(Apify HTTP (\d+)\)\.$/,
    "Couldn't fetch the video (Apify HTTP $1).",
  ],
  [/^Não consegui pegar o vídeo: (.+)$/, "Couldn't get the video: $1"],
  [
    /^Esse post é restrito \(conta privada, restrição de idade ou de país\) e só abre para quem está logado, então não dá para pegar pelo link\. Baixe o vídeo e envie o arquivo\.$/,
    "This post is restricted (private account, age or country restriction) and only opens for logged-in users, so it can't be fetched by link. Download the video and upload the file.",
  ],
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
  [
    /^Esta carteira tem (\S+) USDC na Solana\. A cobrança é de (\S+) USDC\.$/,
    "This wallet has $1 USDC on Solana. The charge is for $2 USDC.",
  ],
  [
    /^Esta carteira não tem USDC suficiente na rede (.+) para esta cobrança\.$/,
    "This wallet doesn't have enough USDC on the $1 network for this charge.",
  ],
  [
    /^Troque a carteira para a rede (.+) e tente de novo\.$/,
    "Switch the wallet to the $1 network and try again.",
  ],

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
  [/^Falha no Gemini Omni \(HTTP (\d+)\)\.$/, "Gemini Omni failed (HTTP $1)."],
  [/^Falha no Veo \(HTTP (\d+)\)\.$/, "Veo failed (HTTP $1)."],
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
  [/^Falha no Sapiens \(HTTP (\d+)\)\.$/, "Sapiens failed (HTTP $1)."],
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
  [/^O Sapiens recusou a entrada: (.+)$/, "Sapiens rejected the input: $1"],
  [/^O Sapiens falhou: (.+)$/, "Sapiens failed: $1"],
  [
    /^Você já tem (\d+) tokens ativos\. Revogue um para criar outro\.$/,
    "You already have $1 active tokens. Revoke one to create another.",
  ],
  [
    /^No corpo inteiro cada cena pode ter até (\d+)s de fala\. Divida a fala em mais cenas \(uma linha em branco entre elas\) ou encurte\.$/,
    "In full body each scene can have up to $1s of speech. Split the speech into more scenes (a blank line between them) or shorten it.",
  ],
  [
    /^O Runway não conseguiu preparar o avatar com esta imagem: (.+)$/,
    "Runway couldn't prepare the avatar from this image: $1",
  ],
  [
    /^A fala ficou com (\d+)s e passa dos (\d+)s escolhidos\. Encurte o texto ou escolha uma duração maior\.$/,
    "The speech came out at $1s, over the $2s you chose. Shorten the text or pick a longer duration.",
  ],
  [/^Vídeo com (\d+) min — o máximo é 15 min\.$/, "Video is $1 min long — the maximum is 15 min."],
  [
    /^A fala da cena (\d+) passa de (\d+)s\. Encurte essa fala\.$/,
    "The speech in scene $1 is over $2s. Shorten it.",
  ],
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
  // Criar vídeo (/api/videos/criar)
  "Não deu para tirar o fundo da imagem do personagem. Tente de novo ou escolha outra imagem.":
    "Couldn't remove the background from the character image. Try again or choose another image.",
  // Motion (/api/motion)
  "Banco ou armazenamento não configurados.":
    "Database or storage not configured.",
  "Este modelo não aceita esse esforço.":
    "This model doesn't accept that effort level.",
  "Motion não encontrado.":
    "Motion not found.",
  "Áudio não encontrado.":
    "Audio not found.",
  "Espere a gravação do MP4 terminar.":
    "Wait for the MP4 recording to finish.",
  "Este motion não está pronto para gravar.":
    "This motion isn't ready to record.",
  "Só dá para ajustar um motion pronto.":
    "Only a finished motion can be adjusted.",
  "Motion sem HTML.":
    "Motion has no HTML.",
  "Não consegui criar o motion. Os créditos foram devolvidos.":
    "Couldn't create the motion. Your credits were refunded.",
  "Informe o endereço do site.":
    "Enter the website address.",
  "Escolha o influencer.":
    "Choose the influencer.",
  "Duração inválida.":
    "Invalid duration.",
  "Modelo inválido.":
    "Invalid model.",
  "Diga o que mudar.":
    "Say what to change.",
  "Envie ao menos uma foto do produto.":
    "Upload at least one product photo.",
  "No misto, escolha o influencer e envie o produto ou o site.":
    "In mixed mode, choose the influencer and add the product or the website.",
  // Formulários da landing page (app/api/leads)
  "Muitas tentativas seguidas. Tente de novo em alguns minutos.":
    "Too many attempts in a row. Try again in a few minutes.",
  "Confira os campos: nome e um e-mail válido são obrigatórios.":
    "Check the fields: a name and a valid email are required.",
  "Não foi possível registrar agora. Tente de novo mais tarde.":
    "We couldn't save it right now. Try again later.",
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
  "Não consegui cortar o vídeo.": "Couldn't trim the video.",
  "Você já fez o check-in. O próximo libera 24 horas depois do último.":
    "You've already checked in. The next one unlocks 24 hours after the last.",
  "Não consegui registrar o check-in.": "Couldn't register the check-in.",
  "Escreva o motivo do reembolso.": "Write the reason for the refund.",
  "Só dá para pedir reembolso de um vídeo pronto.":
    "You can only request a refund for a finished video.",
  "Este vídeo não gastou créditos.": "This video didn't use any credits.",
  "Você já pediu o reembolso deste vídeo.":
    "You've already requested a refund for this video.",
  "Não consegui registrar o pedido.": "Couldn't register the request.",
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
  "O Seedance recusa vídeos em que aparece o rosto de uma pessoa real. Use um dos modelos Kling O3 para este vídeo.":
    "Seedance refuses videos showing a real person's face. Use one of the Kling O3 models for this video.",
  "O MiniMax Recast só troca pessoas: não muda a cena nem o estilo do vídeo. Escolha outro modelo para isso.":
    "MiniMax Recast only replaces people: it doesn't change the scene or the video's style. Choose another model for that.",
  "Sapiens não configurado no servidor (SAPIENS_KEY).":
    "Sapiens is not configured on the server (SAPIENS_KEY).",
  "O filtro de conteúdo da IA barrou este vídeo ou as imagens enviadas. Isso costuma acontecer com cenas de filmes e séries, pessoas famosas, marcas ou conteúdo sensível. Tente com outro vídeo ou outra imagem.":
    "The AI's content filter blocked this video or the images you sent. This usually happens with scenes from films and series, famous people, brands or sensitive content. Try another video or another image.",
  "Falha no fal.ai.": "fal.ai failed.",
  // Gemini Omni (lib/video/omni.ts)
  "Gemini Omni não configurado no servidor (GEMINI_API_KEY).":
    "Gemini Omni isn't configured on the server (GEMINI_API_KEY).",
  "O Gemini Omni recusou este vídeo ou as imagens enviadas. Ele não aceita algumas pessoas reconhecíveis nem conteúdo sensível. Tente com um dos modelos Kling O3.":
    "Gemini Omni refused this video or the images you sent. It doesn't accept some recognizable people or sensitive content. Try one of the Kling O3 models.",
  "O Gemini Omni não conseguiu trocar a pessoa num dos trechos do vídeo.":
    "Gemini Omni couldn't swap the person in one of the video's segments.",
  "A chave do Gemini não tem acesso ao Gemini Omni. Confira GEMINI_API_KEY (precisa de faturamento ativo).":
    "The Gemini key has no access to Gemini Omni. Check GEMINI_API_KEY (billing must be enabled).",
  "O Gemini Omni não está disponível nesta chave do Gemini.":
    "Gemini Omni isn't available on this Gemini key.",
  "Falha no Gemini Omni.": "Gemini Omni failed.",
  "O Google demorou demais para receber um trecho do vídeo.":
    "Google took too long to receive a segment of the video.",
  "O Google não conseguiu ler um trecho do vídeo.":
    "Google couldn't read a segment of the video.",
  "O Google não encontrou um dos trechos do vídeo.":
    "Google couldn't find one of the video's segments.",
  "O Google não conseguiu salvar um dos trechos.":
    "Google couldn't save one of the segments.",
  // Veo pela API do Gemini (lib/video/veo.ts)
  "O Veo recusou a imagem ou o pedido. Ele não aceita algumas pessoas reconhecíveis, crianças nem conteúdo sensível. Tente outra imagem, outro texto ou outro modelo.":
    "Veo refused the image or the request. It doesn't accept some recognizable people, children or sensitive content. Try another image, another text or another model.",
  "O Veo não conseguiu gerar o vídeo.": "Veo couldn't generate the video.",
  "O Google não encontrou o vídeo.": "Google couldn't find the video.",
  "A chave do Gemini não tem acesso ao Veo. Confira GEMINI_API_KEY (precisa de faturamento ativo).":
    "The Gemini key has no access to Veo. Check GEMINI_API_KEY (billing must be enabled).",
  "O Google recusou o pedido do vídeo.": "Google refused the video request.",
  "Falha no Veo.": "Veo failed.",
  "O Runway não devolveu vídeo.": "Runway returned no video.",
  "Geração cancelada no Runway.": "Generation cancelled on Runway.",
  "O Runway barrou o texto da cena na moderação. Descreva só o que aparece (ação, câmera, luz), sem falas, nomes de pessoas, marcas ou personagens famosos.":
    "Runway's moderation blocked the scene text. Describe only what is seen (action, camera, light), with no dialogue, names of people, brands or famous characters.",
  "O Runway barrou a imagem na moderação. Tente outra imagem do personagem.":
    "Runway's moderation blocked the image. Try another image of the character.",
  "Escolha a voz do personagem.":
    "Choose the character's voice.",
  "Vídeo falado não configurado (FAL_KEY e ELEVENLABS_API_KEY).":
    "Spoken video is not configured (FAL_KEY and ELEVENLABS_API_KEY).",
  "A conta da ElevenLabs chegou ao limite de vozes do plano. Apague vozes que não usa ou aumente o plano da ElevenLabs.":
    "The ElevenLabs account reached its plan's voice limit. Delete unused voices or upgrade the ElevenLabs plan.",
  "Vídeo falado não configurado (RUNWAYML_API_SECRET e ELEVENLABS_API_KEY).":
    "Spoken video is not configured (RUNWAYML_API_SECRET and ELEVENLABS_API_KEY).",
  "Informe o vídeo ou a foto.": "Provide the video or the photo.",
  "Dê um nome ao token.": "Give the token a name.",
  "Token não encontrado.": "Token not found.",
  "JSON inválido.": "Invalid JSON.",
  "O vídeo original desta troca não está mais disponível para comparar.":
    "The original video of this swap is no longer available to compare.",
  "Banco não configurado.": "Database not configured.",
  "Rede desconhecida.": "Unknown network.",
  "Não consegui falar com o Nido agora. Tente de novo em instantes.":
    "I couldn't reach Nido right now. Try again in a moment.",
  "Não consegui ler seus ganhos no Nido agora.":
    "I couldn't read your Nido earnings right now.",
  "Muitas consultas seguidas.":
    "Too many requests in a row.",
  "email inválido.":
    "invalid e-mail.",
  "Pedido inválido.":
    "Invalid request.",
  "Não foi possível enviar. Confira sua conexão e tente de novo.":
    "Couldn't send. Check your connection and try again.",
  "Descreva a figurinha ou envie a figurinha original.":
    "Describe the sticker or upload the original sticker.",
  "Não consegui montar a figurinha. Tente de novo.":
    "I couldn't build the sticker. Try again.",
  "Não consegui montar o vídeo final.": "I couldn't put the final video together.",
  "Não consegui iniciar a troca da figurinha.":
    "I couldn't start the sticker swap.",
  "Não consegui preparar a figurinha animada.":
    "I couldn't prepare the animated sticker.",
  "A troca da figurinha falhou.":
    "The sticker swap failed.",
  "O Runway bloqueou a geração pela moderação de conteúdo.":
    "Runway blocked the generation through content moderation.",
  "Chave do Runway inválida. Confira RUNWAYML_API_SECRET.":
    "Invalid Runway key. Check RUNWAYML_API_SECRET.",
  "Sem créditos na API do Runway. Adicione saldo em dev.runwayml.com.":
    "No credits on the Runway API. Add balance at dev.runwayml.com.",
  "Limite de uso do Runway atingido. Tente em alguns minutos.":
    "Runway usage limit reached. Try again in a few minutes.",
  "Falha no Runway.": "Runway failed.",
  "Este modelo de vídeo não está configurado neste servidor.":
    "This video model is not configured on this server.",
  "Sapiens não configurado no servidor.": "Sapiens not configured on the server.",
  "O Sapiens não devolveu vídeo.": "Sapiens returned no video.",
  "O Sapiens não conseguiu gerar o vídeo.":
    "Sapiens couldn't generate the video.",
  "Chave do Sapiens inválida. Confira SAPIENS_KEY.":
    "Invalid Sapiens key. Check SAPIENS_KEY.",
  "Sem saldo na API do Sapiens. Recarregue em sapiensinteticos.com.":
    "No balance on the Sapiens API. Top up at sapiensinteticos.com.",
  "O Sapiens está ocupado agora. Tente em alguns minutos.":
    "Sapiens is busy right now. Try again in a few minutes.",
  "Falha no Sapiens.": "Sapiens failed.",

  // Vídeo por link
  "Cole um link válido.": "Paste a valid link.",
  "Link não suportado. Use TikTok, Instagram (reel/post), YouTube Shorts, X (post com vídeo) ou um link direto de .mp4.":
    "Link not supported. Use TikTok, Instagram (reel/post), YouTube Shorts, X (post with video) or a direct .mp4 link.",
  "Busca de vídeos do X não configurada (TWITTER_API_KEY).":
    "X video lookup not configured (TWITTER_API_KEY).",
  "Sem créditos no twitterapi.io.": "No credits left on twitterapi.io.",
  "Não achei esse post no X (é público? foi apagado?).":
    "Couldn't find that post on X (is it public? was it deleted?).",
  "Esse post do X não tem vídeo.": "That X post has no video.",
  "Pedido de conexão inválido. Tente conectar de novo.":
    "Invalid connection request. Try connecting again.",
  "A conexão por MCP ainda não está liberada para esta conta.":
    "Connecting over MCP isn't enabled for this account yet.",
  "Não achei as pessoas marcadas em nenhuma tomada do vídeo. Marque de novo, num momento em que elas aparecem bem.":
    "I couldn't find the marked people in any shot of the video. Mark them again at a moment where they show clearly.",
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
  "Não consegui gerar o PDF.": "Couldn't generate the PDF.",
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
  "Muitas cobranças em aberto nesta rede; tente outra rede.":
    "Too many open charges on this network; try another network.",
  "Pagamento não encontrado.": "Payment not found.",
  "Cole o hash da transação (0x… com 64 caracteres) ou o link dela no explorer.":
    "Paste the transaction hash (0x… with 64 characters) or its explorer link.",
  "Cole o hash da transação (a assinatura, com cerca de 88 caracteres) ou o link dela no explorer.":
    "Paste the transaction hash (the signature, about 88 characters) or its explorer link.",
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
  "Esta cobrança não está mais em aberto. Feche e gere outra.":
    "This charge is no longer open. Close it and create another.",
  "A rede não confirmou este pagamento. Se o valor saiu da carteira, cole o hash da transação; se não saiu, pague de novo.":
    "The network didn't confirm this payment. If the amount left your wallet, paste the transaction hash; if it didn't, pay again.",
  "A carteira não está mais conectada. Conecte de novo.":
    "The wallet is no longer connected. Connect it again.",
  "O pagamento foi recusado na carteira.":
    "The payment was rejected in the wallet.",
  "A carteira não enviou o pagamento.": "The wallet didn't send the payment.",
  "A carteira não devolveu o hash da transação.":
    "The wallet didn't return the transaction hash.",
  "A carteira não liberou nenhuma conta.":
    "The wallet didn't share any account.",

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
  "Não consegui confirmar a transferência no Stripe. O saque ficou em análise e o saldo não se perde.":
    "Couldn't confirm the transfer on Stripe. The withdrawal is under review and your balance won't be lost.",
  "Não consegui a cotação do dólar agora. O saldo continua disponível; tente de novo em instantes.":
    "Couldn't get the dollar exchange rate right now. Your balance is still available; try again in a moment.",
  "O saque está indisponível no momento. O saldo continua disponível; tente de novo mais tarde.":
    "Withdrawals are unavailable right now. Your balance is still available; try again later.",
  "O limite diário de saques foi atingido. O saldo continua disponível; tente de novo amanhã.":
    "The daily withdrawal limit was reached. Your balance is still available; try again tomorrow.",
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
  "A geração de PFP não está configurada (OPENAI_API_KEY).":
    "PFP generation is not set up (OPENAI_API_KEY).",
  "Foto não encontrada. Envie de novo.":
    "Photo not found. Upload it again.",
  "Não consegui usar a sua foto de perfil. Envie uma foto.":
    "Couldn't use your profile photo. Upload a photo instead.",
  "Não consegui ler essa imagem. Envie um JPG, PNG ou WebP.":
    "Couldn't read that image. Upload a JPG, PNG or WebP.",
  "Não consegui gerar o PFP. Os créditos foram devolvidos.":
    "Couldn't generate the PFP. Your credits were refunded.",
  "PFP não encontrado.":
    "PFP not found.",
  "Você já gerou os 3 PFPs da sua conta.":
    "You've already generated the 3 PFPs your account allows.",
  "Só o admin pode excluir PFPs.":
    "Only an admin can delete PFPs.",
  "Este PFP é a sua foto de perfil. Troque a foto antes de excluir.":
    "This PFP is your profile photo. Change your photo before deleting it.",
  "Live não configurada no servidor (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, RUNWAYML_API_SECRET e ELEVENLABS_API_KEY).":
    "Live is not set up on the server (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, RUNWAYML_API_SECRET and ELEVENLABS_API_KEY).",
  "Live não encontrada.": "Live not found.",
  "Duração da live inválida: use de 1 a 120 minutos.": "Invalid live length: use 1 to 120 minutes.",
  "Esta live já entrou no ar em outra aba.":
    "This live already went on air in another tab.",
  "O avatar ainda está sendo preparado.": "The avatar is still being prepared.",
  "Esta live já terminou.": "This live has already ended.",
  "O tempo desta live acabou.": "This live is out of time.",
  "A live não está no ar.": "The live isn't on air.",
  "Não consegui escrever a resposta. Tente de novo.":
    "Couldn't write the reply. Try again.",
  "Não consegui ligar o chat. Tente de novo.": "Couldn't connect the chat. Try again.",
  "Origem do chat inválida.": "Invalid chat source.",
  "Chat do YouTube não configurado no servidor (YOUTUBE_API_KEY).":
    "YouTube chat is not set up on the server (YOUTUBE_API_KEY).",
  "A cota diária da API do YouTube acabou. Volta amanhã.":
    "The YouTube API daily quota ran out. It resets tomorrow.",
  "O chat dessa live do YouTube terminou ou não foi encontrado.":
    "That YouTube live chat has ended or wasn't found.",
  "O chat dessa live do YouTube está desligado.": "That YouTube live chat is turned off.",
  "Cole o link da live do YouTube (ou o id do vídeo).":
    "Paste the YouTube live link (or the video ID).",
  "Esse vídeo não está ao vivo agora (ou o chat dele está desligado).":
    "That video isn't live right now (or its chat is turned off).",
  "Chat do Kick não configurado no servidor (KICK_CLIENT_ID e KICK_CLIENT_SECRET).":
    "Kick chat is not set up on the server (KICK_CLIENT_ID and KICK_CLIENT_SECRET).",
  "Escreva o nome do canal do Kick (ou cole o link).":
    "Type the Kick channel name (or paste the link).",
  "Canal do Kick não encontrado.": "Kick channel not found.",
  "Não consegui conferir a transmissão agora.": "Couldn't check the stream right now.",
  "Rede de transmissão inválida.": "Invalid streaming platform.",
  "Persona não encontrada.": "Persona not found.",
  "Marque a declaração para usar um vídeo gravado.": "Check the declaration to use a recorded video.",
  "Escreva o que falar.": "Type what to say.",
  "Bot do Discord não configurado no servidor (DISCORD_BOT_TOKEN).":
    "Discord bot is not set up on the server (DISCORD_BOT_TOKEN).",
  "Cole o link do canal de voz ou palco (no Discord: botão direito no canal → Copiar link).":
    "Paste the voice or stage channel link (in Discord: right-click the channel → Copy link).",
  "O bot do NIDO não está nesse servidor (ou não vê esse canal). Convide o bot primeiro.":
    "The NIDO bot isn't in that server (or can't see that channel). Invite the bot first.",
  "Esse canal não é de voz nem palco.": "That channel isn't a voice or stage channel.",
  "O bot não vê esse canal de voz ou palco. Convide o bot de novo.":
    "The bot can't see that voice or stage channel. Invite the bot again.",
  "O bot não conseguiu entrar no canal. Confira as permissões (conectar e falar).":
    "The bot couldn't join the channel. Check its permissions (connect and speak).",
  "O bot não conseguiu entrar no canal.": "The bot couldn't join the channel.",
  "Imagem do cenário não encontrada.": "Scene image not found.",
  "Descreva o cenário (ex.: numa praia ao pôr do sol).": "Describe the scene (e.g.: on a beach at sunset).",
  "Escreva o nome de quem vai aparecer.": "Type the name of who will appear.",
  "Descreva quem é e como fala (pelo menos uma frase).":
    "Describe who they are and how they talk (at least one sentence).",
  "Escolha um personagem ou envie uma foto.": "Pick a character or upload a photo.",
  "Na Sombra ao vivo, o cenário é só por texto.":
    "In Live Shadow, the scene can only be described in text.",
  "Sombra não configurada no servidor (DECART_API_KEY).":
    "Shadow is not set up on the server (DECART_API_KEY).",
  "Marque a declaração de que pode usar este vídeo.":
    "Check the declaration that you may use this video.",
  "Envie um vídeo ou cole um link.":
    "Upload a video or paste a link.",
  "Link não encontrado. Cole de novo.":
    "Link not found. Paste it again.",
  "Não consegui ler esse vídeo. Envie um MP4, MOV ou WebM.":
    "Couldn't read that video. Upload an MP4, MOV or WebM.",
  "O vídeo pode ter até 10 minutos. Corte um trecho e envie de novo.":
    "The video can be up to 10 minutes. Trim it and upload again.",
  "A Decart recusou a chave. Confira DECART_API_KEY.":
    "Decart rejected the key. Check DECART_API_KEY.",
  "A Decart recusou o vídeo. Os créditos foram devolvidos.":
    "Decart rejected the video. Your credits were refunded.",
  "Pedaço de áudio inválido.":
    "Invalid audio chunk.",
  "Não consegui ler a foto do influencer.":
    "Couldn't read the influencer's photo.",
  "A Decart não conseguiu trocar a pessoa neste vídeo.":
    "Decart couldn't swap the person in this video.",
  "Cole o link de um vídeo (VOD) ou clipe da Twitch ou do Kick.":
    "Paste the link to a Twitch or Kick video (VOD) or clip.",
  "Não consegui abrir esse link agora. Tente de novo.":
    "Couldn't open that link right now. Try again.",
  "Não consegui ler a duração desse vídeo.":
    "Couldn't read that video's length.",
  "Escolha um trecho de pelo menos 1 segundo.":
    "Pick a section of at least 1 second.",
  "O trecho pode ter até 12 horas.":
    "The section can be up to 12 hours.",
  "A conta da Decart está sem créditos.":
    "The Decart account is out of credits.",
  "A conta da Decart está sem créditos. Recarregue em platform.decart.ai e gere de novo.":
    "The Decart account is out of credits. Top it up at platform.decart.ai and generate again.",
  "Vídeo do Kick não encontrado (apagado ou privado).":
    "Kick video not found (deleted or private).",
  "VOD da Twitch não encontrado (apagado ou privado).":
    "Twitch VOD not found (deleted or private).",
  "Clipe da Twitch não encontrado.":
    "Twitch clip not found.",
  "Esse vídeo do Kick ainda não está disponível.":
    "That Kick video isn't available yet.",
  "Clipe do Kick não encontrado.":
    "Kick clip not found.",
  "A Twitch não liberou esse VOD.":
    "Twitch didn't release that VOD.",
  "O vídeo é só para inscritos ou foi bloqueado. Baixe e envie o arquivo.":
    "The video is subscribers-only or blocked. Download it and upload the file.",
  "O vídeo não tem uma versão que dê para ler.":
    "The video has no version that can be read.",
  "O vídeo veio vazio.":
    "The video came back empty.",
  "O processo da Sombra não está ligado (worker/sombra).":
    "The Shadow process isn't running (worker/sombra).",
  "O Lucy não conseguiu processar uma parte do vídeo.":
    "Lucy couldn't process part of the video.",
  "O Lucy demorou demais numa parte do vídeo.":
    "Lucy took too long on part of the video.",
  "Não consegui ler o vídeo de origem (o link pode ter expirado ou o arquivo está corrompido).":
    "Couldn't read the source video (the link may have expired or the file is corrupted).",
  "A ElevenLabs não conseguiu trocar a voz.":
    "ElevenLabs couldn't swap the voice.",
  "Banco de dados não configurado.":
    "Database not set up.",
  "A troca falhou.":
    "The swap failed.",
  // Vídeo de produto (app/api/produto)
  "Diga qual é o produto.": "Say what the product is.",
  "Modelo ou duração inválidos.": "Invalid model or duration.",
  "Falha ao montar as cenas.": "Couldn't put the scenes together.",
  "As cenas não batem com a duração escolhida. Monte as cenas de novo.":
    "The scenes don't match the chosen duration. Put the scenes together again.",
  "Escreva a fala de cada cena.": "Write the speech for each scene.",
  "Escolha a voz.": "Choose the voice.",
  // Motion a partir de um vídeo
  "Confirme que tem direito de usar o vídeo de referência.": "Confirm that you have the right to use the reference video.",
  "Vídeo de referência não encontrado.": "Reference video not found.",
  "Não consegui ler o vídeo de referência. Envie outro.": "Couldn't read the reference video. Upload another one.",
  "Envie o vídeo de referência (arquivo ou link).": "Send the reference video (file or link).",
  "Não consegui abrir o vídeo de referência. Envie de novo.": "Couldn't open the reference video. Send it again.",
  // Criar produto (app/api/produto/criar)
  "Dê um nome ao produto.": "Give the product a name.",
  "Envie a logo da empresa.": "Upload the company logo.",
  "Envie a foto básica do produto ou descreva como ele é.": "Upload the basic product photo or describe what it looks like.",
  "Este modelo de imagem não está configurado neste servidor.": "This image model isn't set up on this server.",
  "Criar produto ainda não está disponível neste servidor.": "Create product isn't available on this server yet.",
  "Produto não encontrado.": "Product not found.",
  "Falha ao traduzir.": "Couldn't translate.",
  // Música de fundo (app/api/videos/musica)
  "Confirme que tem direito de usar a música.": "Confirm that you have the right to use the music.",
  "Link não suportado. Use YouTube, TikTok, Instagram, X ou um link direto de vídeo.":
    "Unsupported link. Use YouTube, TikTok, Instagram, X or a direct video link.",
  "Não consegui tirar a música desse link.": "Couldn't get the music from that link.",
  "Descreva cada cena.": "Describe each scene.",
  "Escolha quem aparece no vídeo.": "Choose who appears in the video.",
  "Envie a foto do produto.": "Upload the product photo.",
  "A IA de imagem recusou uma das cenas. Mude a descrição dela e tente de novo.":
    "The image AI refused one of the scenes. Change its description and try again.",
};

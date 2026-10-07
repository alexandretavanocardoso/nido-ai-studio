import type { Chave } from "./pt";

/** Interface text in English. Every key from pt.ts must exist here (checked by TypeScript). */
export const en: Record<Chave, string> = {
  "conta.entrar": "Sign in",
  "conta.entrouComo": "Signed in as",
  "conta.planos": "Plans & credits",
  "conta.sair": "Sign out",
  "conta.idioma": "Language",
  "conta.semEmail": "no email",

  "inicio.selo": "Create your Synthetic Influencer",
  "inicio.titulo1": "Build your influencer",
  "inicio.titulo2": "field by field.",
  "inicio.descricao":
    "Define who they are in 7 steps, then produce images, videos, captions and scheduled posts in the Studio — all in one place.",
  "inicio.limite": "Your {plano} plan allows {n} characters.",
  "inicio.upgrade": "Upgrade to create more",
  "inicio.criar": "Create character",
  "inicio.verSeus": "Or see yours",
  "inicio.biblioteca": "Library",
  "inicio.seus": "Your characters",
  "inicio.novo": "New",
  "inicio.carregando": "Loading…",
  "inicio.soAquiLimite":
    "Characters only on this device: {x}. The {plano} plan keeps {n} in your account; the rest do not show up on other devices.",
  "inicio.soAquiFalha":
    "Characters only on this device: {x}. We could not save them to your account; we will try again next time you open the app.",
  "inicio.upgradeSalvar": "Upgrade to save them all",

  "personagem.voltar": "Back to your characters",
  "personagem.semNome": "Untitled",
  "personagem.daFicha": "{n}% of the profile",
  "personagem.salvo": "Saved automatically",
  "personagem.abaFicha": "Profile",
  "personagem.abaEstudio": "Studio",
  "personagem.dicaFicha": "Who the character is",
  "personagem.dicaEstudio": "Create content",
  "personagem.naoEncontrado": "Character not found",
  "personagem.naoEncontradoTexto": "It may have been deleted in another tab.",
  "personagem.voltarLista": "Back to the list",

  "etapa.xDeY": "Step {x} of {y}",
  "etapa.voltar": "Back",
  "etapa.avancar": "Next",
  "etapa.irEstudio": "Go to the Studio",
  "etapa.dica": "Tip",
  "etapa.preencherIA": "Fill this step with AI",
  "passo.identidade.titulo": "Identity",
  "passo.identidade.subtitulo": "Who this character is",
  "passo.identidade.dica":
    "Start with the essentials: an easy-to-remember name and one sentence that sums up the character. Example: “Lila, an interior designer who hates cold minimalism.”",
  "passo.visual.titulo": "Look",
  "passo.visual.subtitulo": "How they appear",
  "passo.visual.dica":
    "Reference images are worth a thousand words. Upload photos of people, moodboards or artwork with the vibe you want — and describe how they resemble the character.",
  "passo.soul.titulo": "Personality",
  "passo.soul.subtitulo": "Their soul",
  "passo.soul.dica":
    "Memorable characters are contradictory. A mentor who is insecure. A mocking one who is generous. List specific tastes (not ‘good food’, but ‘street-market pastry on Friday night’).",
  "passo.nicho.titulo": "Niche & Strategy",
  "passo.nicho.subtitulo": "Where they shine",
  "passo.nicho.dica":
    "Write the promise as if it were the profile bio: “Follow me to learn X in Y.” Then study 3 references in the niche and note what they do well — that becomes your benchmark.",
  "passo.voz.titulo": "Voice & Language",
  "passo.voz.subtitulo": "How they talk",
  "passo.voz.dica":
    "Write 3 lines in their tone. Read them out loud. If it sounds like a robot or like you forcing it, change it. Short, repeatable catchphrases stick better than pretty sentences.",
  "passo.monetizacao.titulo": "Monetization & Brands",
  "passo.monetizacao.subtitulo": "How they make a living",
  "passo.monetizacao.dica":
    "What the character would never promote matters more than what they would. That defines the audience's trust. And be clear about transparency: they are synthetic, and that has to show.",
  "passo.revisao.titulo": "Review",
  "passo.revisao.subtitulo": "Checklist and final profile",
  "passo.revisao.dica":
    "Read the profile as if presenting the character in a meeting. If a field leaves doubt, go back and refine it — everything the Studio creates (images, videos, text) starts from this profile.",

  "estudio.videos.titulo": "Videos",
  "estudio.videos.descricao":
    "Swap the person in a video for the character, create new scenes, edit captions and voice-overs.",
  "estudio.textos.titulo": "Text",
  "estudio.textos.descricao":
    "Captions, scripts and comment replies in the character's voice.",
  "estudio.imagens.titulo": "Images",
  "estudio.imagens.descricao":
    "Reference sheet with poses and portraits faithful to the character.",
  "estudio.publicar.titulo": "Publish",
  "estudio.publicar.descricao":
    "Connect the influencer's accounts and post now, schedule or save to the backlog — Instagram, TikTok, YouTube Shorts, X and LinkedIn.",
  "estudio.radar.titulo": "Radar",
  "estudio.radar.descricao":
    "What is happening today in the character's topics, with a relevance score and a post idea.",
  "estudio.agendamentos.titulo": "Schedule",
  "estudio.agendamentos.descricao":
    "Calendar of scheduled and published posts, plus the backlog of posts ready to schedule.",

  "criar.pergunta": "How do you want to start?",
  "criar.titulo": "Let's create your character.",
  "criar.descricao":
    "Fill it in field by field, start from the image, let the AI build the profile or import a character you already made here.",
  "criar.manual.titulo": "Create manually",
  "criar.manual.descricao":
    "Go straight to the blank wizard. Fill in each field at your own pace.",
  "criar.imagem.titulo": "Start from the image",
  "criar.imagem.descricao":
    "Generate the character's image right here and go straight to the profile.",
  "criar.ia.titulo": "Expand with the site's AI",
  "criar.ia.descricao":
    "Write a short context and the site's AI fills in the profile.",
  "criar.importar.titulo": "Import character",
  "criar.importar.descricao":
    "Upload the .json from “Export profile → Data (JSON)”. It comes in as a new character.",
};

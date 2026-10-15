<p align="center">
  <img src="public/logo/NIDO%20AI%20STUDIO.png" alt="NIDO AI Studio" width="240" />
</p>

# NIDO AI Studio

Plataforma para criar e operar **influenciadores sintéticos**: você define quem é o personagem (identidade, visual, personalidade, voz, nicho) e produz, no mesmo lugar, as imagens, os vídeos, os textos e os posts agendados dele.

O personagem nasce de uma ficha preenchida em etapas — à mão ou com ajuda de IA — e essa ficha passa a guiar tudo o que é gerado depois, para o influenciador manter o mesmo rosto, o mesmo jeito de falar e o mesmo posicionamento em todo conteúdo.

## Fluxo

1. **Entrar** com a conta Google e escolher um plano. Cada ação com IA gasta créditos; o custo aparece antes e volta se a geração falhar.
2. **Criar o personagem.** Quatro caminhos: preencher à mão, começar pela imagem, escrever um contexto curto e deixar a IA expandir a ficha, ou importar um personagem já feito. O nome é sempre escolhido por você.
3. **Preencher a ficha** em 7 etapas: Identidade, Visual, Personalidade, Nicho e Estratégia, Voz e Linguagem, Monetização e Marcas, Revisão. Em cada etapa a IA pode preencher tudo, sugerir um campo ou checar a coerência.
4. **Gerar as imagens** no Estúdio: o card de referência (várias vistas do personagem), retratos fiéis a ele e a **troca de pessoa em foto** (você envia uma foto e o influenciador entra no lugar de quem você marcar).
5. **Produzir vídeos:**
   - **trocar a pessoa de um vídeo** pelo influenciador, mantendo cenário, movimento e áudio — a partir de um arquivo ou de um link do TikTok, Instagram ou YouTube Shorts;
   - **criar vídeos novos** a partir de uma imagem do personagem;
   - **editar ou remover legendas** e **adicionar falas** com a voz dele.
6. **Dar voz ao personagem:** criar uma voz pela descrição da ficha ou clonar uma amostra, e gerar falas.
7. **Escrever como o personagem:** legendas, roteiros e respostas a comentários no tom, nas gírias e nos bordões da ficha.
8. **Acompanhar o Radar:** todo dia, o que aconteceu nos temas do personagem (notícias e, se ligado, o que está em alta no X), com nota de relevância, ideia de post e aviso quando algo está quente.
9. **Publicar:** conectar as redes do influenciador e postar na hora, agendar no calendário ou guardar no backlog — Instagram, TikTok, YouTube Shorts, X e LinkedIn.

A interface está em português e inglês.

## IAs usadas

| Para quê | IA | Empresa |
|---|---|---|
| Texto: expandir e preencher a ficha, sugerir campo, checar coerência, escrever como o personagem | **Claude Sonnet 5.5** | Anthropic |
| Imagem: card de referência, retratos e troca de pessoa em foto | **Nano Banana 2** e **Nano Banana Pro** | Google |
| Imagem: foto realista em 4K | **Seedream 4.5** | ByteDance |
| Imagem: editorial e moda | **FLUX.2 Pro** | Black Forest Labs |
| Imagem com texto escrito | **GPT Image 2** | OpenAI |
| Persona treinada (modelo próprio do personagem, rosto idêntico) | **FLUX.1** e **FLUX.2** com LoRA | Black Forest Labs |
| Visão: descrever as pessoas de um vídeo ou foto e escolher o melhor quadro | **Gemini Flash** | Google |
| Vídeo: trocar a pessoa pelo personagem (padrão) | **Kling O3 Edit** (Standard, Pro ou 4K) | Kuaishou |
| Vídeo: trocar a pessoa pelo personagem (premium) | **Seedance 2.5** | ByteDance |
| Vídeo: trocar a pessoa pelo personagem (o mais barato) | **Gemini Omni Flash** | Google |
| Vídeo: criar a partir de uma imagem | **Gen-4 Turbo**, **Gen-4.5** | Runway |
| Vídeo: criar a partir de uma imagem, com áudio | **Veo 3.1 Fast**, **Veo 3.1 Lite** | Google |
| Vídeo: remover legenda reconstruindo o fundo | **Bria Video Eraser** | Bria |
| Recorte do fundo do personagem | **BiRefNet** | — |
| Radar: pesquisar as notícias do dia e dar nota de relevância | **Claude Haiku 4.5** com busca na web | Anthropic |
| Radar: o que está em alta no X | **Grok** com busca no X | xAI |
| Voz: criar, clonar e gerar falas | **ElevenLabs** | ElevenLabs |

Seedream, FLUX, Kling, Seedance, Bria e BiRefNet rodam pelo [fal.ai](https://fal.ai). O GPT Image é chamado direto na OpenAI quando há `OPENAI_API_KEY` (sem ela, também vai pelo fal). O Veo 3.1 Fast roda pela API do Runway (ou do Sapiens, quando há a chave) e o Veo 3.1 Lite direto na API do Gemini. Claude, Nano Banana, Gemini, Grok, Runway e ElevenLabs são chamados direto na API de cada empresa.

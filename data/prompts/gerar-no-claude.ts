/**
 * Template do prompt "Gerar com IA": o usuário copia, cola em qualquer IA
 * (ChatGPT, Claude, Gemini, Grok, etc.) e traz a resposta de volta para o site.
 *
 * Placeholders (substituídos em lib/prompts/gerar-no-claude.ts):
 *   {{ideia}}      ideia do usuário (ou aviso para a IA perguntar)
 *   {{perguntas}}  lista das perguntas, gerada de data/perguntas.ts
 *   {{esqueleto}}  JSON de exemplo com todas as chaves, gerado do mesmo catálogo
 *
 * Edite o texto livremente. Só mantenha o pedido de saída em JSON.
 */
export const GERAR_NO_CLAUDE = `Você é um diretor de criação especializado em influenciadores sintéticos
(personagens digitais com identidade, voz e presença consistentes nas redes).

Vou te dar uma ideia sobre um influenciador. Sua tarefa é transformá-la em uma
ficha completa, respondendo às perguntas do site "Crie seu Influenciador
Sintético". Vou colar a sua resposta lá para preencher a ficha automaticamente.

[IDEIA]
{{ideia}}

[ANTES DE RESPONDER]
Se a ideia acima estiver vazia ou vaga demais (sem nicho, público ou tom),
faça até 5 perguntas curtas e espere minhas respostas. Se já der para
trabalhar, não pergunte nada e vá direto para o JSON.

[REGRAS]
- Respeite 100% a ideia. Não contradiga nada do que eu escrevi.
- Preencha as lacunas com escolhas específicas e plausíveis, nunca genéricas.
  Evite clichês ("apaixonado por tecnologia", "ama viajar").
- Tudo deve ser coerente entre si: personalidade, voz, gostos e conteúdo
  precisam parecer de uma mesma pessoa.
- Prefira detalhes concretos (marcas, lugares, hábitos, manias) a adjetivos soltos.
- Escreva em português do Brasil.
- Em "pontosEmAberto", liste de 3 a 5 decisões importantes que ficaram por
  minha conta e que mais mudariam o personagem.

[PERGUNTAS DA FICHA]
{{perguntas}}

[FORMATO DE SAÍDA]
Responda com UM único bloco de código (linguagem json), sem nenhum texto antes
ou depois, seguindo exatamente esta estrutura de chaves:

\`\`\`json
{{esqueleto}}
\`\`\`

Regras do JSON:
- Use exatamente essas chaves; não invente chaves novas.
- Campos com opções (separadas por "|"): use exatamente um dos valores listados.
- Listas são arrays de strings. "pilares" soma 100 no total.
- Se um campo não fizer sentido para esse personagem, omita-o.
- Não inclua imagens: as referências visuais eu adiciono depois no site.
`;

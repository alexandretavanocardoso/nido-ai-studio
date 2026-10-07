import {
  arquetipos,
  emojiOpcoes,
  formas,
  formatos,
  generos,
  modelosNegocio,
  plataformas,
  tamanhoFraseOpcoes,
} from "./choices";

/**
 * Catálogo das perguntas do wizard, usado para:
 *  - montar o prompt "Gerar no Claude" (lib/prompts/gerar-no-claude.ts)
 *  - validar e importar a resposta colada de volta (mesmo arquivo)
 *
 * Ao adicionar uma pergunta nova no wizard, acrescente-a aqui também:
 * o prompt e o importador passam a conhecê-la automaticamente.
 * `id` é o mesmo fieldId usado nos <Field> (dot-notation em Character).
 */

export type TipoPergunta = "texto" | "lista" | "opcao" | "numero" | "ideias";

export interface Pergunta {
  id: string;
  tipo: TipoPergunta;
  descricao: string;
  /** Valores aceitos (tipo "opcao", ou "lista" com soOpcoes). */
  opcoes?: string[];
  /** Em listas: só aceita itens que estejam em `opcoes`. */
  soOpcoes?: boolean;
  /** texto: máx. de caracteres. lista: máx. de itens. */
  max?: number;
}

export interface SecaoPerguntas {
  id: string;
  titulo: string;
  perguntas: Pergunta[];
}

export const SECOES: SecaoPerguntas[] = [
  {
    id: "identidade",
    titulo: "Identidade",
    perguntas: [
      { id: "identidade.nome", tipo: "texto", max: 50, descricao: "nome ou apelido do personagem (máx. 50 caracteres)" },
      { id: "identidade.handles", tipo: "lista", max: 3, descricao: "3 sugestões de @ para as redes" },
      { id: "identidade.ocupacao", tipo: "texto", descricao: "o que ele faz na vida real além de criar conteúdo" },
      { id: "identidade.genero", tipo: "opcao", opcoes: generos.map((g) => g.value), descricao: "gênero" },
      { id: "identidade.forma", tipo: "opcao", opcoes: formas.map((f) => f.value), descricao: "natureza do personagem" },
      { id: "identidade.idadeAparente", tipo: "texto", descricao: "idade aparente (ex.: 28 anos, atemporal)" },
      { id: "identidade.cidade", tipo: "texto", descricao: "cidade/país onde mora" },
      { id: "identidade.idioma", tipo: "texto", descricao: "idioma principal" },
      { id: "identidade.sotaque", tipo: "texto", descricao: "sotaque" },
      { id: "identidade.bio", tipo: "texto", max: 140, descricao: "bio de 1 linha que resume o personagem (máx. 140 caracteres)" },
    ],
  },
  {
    id: "visual",
    titulo: "Visual",
    perguntas: [
      { id: "visual.cabelo", tipo: "texto", descricao: "cabelo (cor, comprimento, textura)" },
      { id: "visual.pele", tipo: "texto", descricao: "pele" },
      { id: "visual.olhos", tipo: "texto", descricao: "olhos" },
      { id: "visual.roupa", tipo: "texto", descricao: "estilo de roupa" },
      { id: "visual.acessorios", tipo: "texto", descricao: "acessórios" },
      { id: "visual.tracosMarcantes", tipo: "texto", descricao: "traços marcantes (tatuagem, sardas, piercing...)" },
      { id: "visual.paleta", tipo: "texto", descricao: "paleta de cores" },
      { id: "visual.cenarios", tipo: "texto", descricao: "cenários recorrentes onde aparece" },
    ],
  },
  {
    id: "soul",
    titulo: "Personalidade",
    perguntas: [
      { id: "soul.arquetipo", tipo: "texto", descricao: `arquétipo (prefira um destes: ${arquetipos.join(", ")})` },
      { id: "soul.adjetivos", tipo: "lista", max: 5, descricao: "5 adjetivos que definem o jeito dele" },
      { id: "soul.gostos.comidas", tipo: "lista", descricao: "comidas que ama (específicas, nada de 'comida boa')" },
      { id: "soul.gostos.musicas", tipo: "lista", descricao: "músicas/artistas que ama" },
      { id: "soul.gostos.hobbies", tipo: "lista", descricao: "hobbies" },
      { id: "soul.gostos.marcas", tipo: "lista", descricao: "marcas que gosta" },
      { id: "soul.gostos.lugares", tipo: "lista", descricao: "lugares que gosta" },
      { id: "soul.gostos.series", tipo: "lista", descricao: "séries/filmes que gosta" },
      { id: "soul.odeia.manias", tipo: "lista", descricao: "manias dos outros que ele odeia" },
      { id: "soul.odeia.conteudos", tipo: "lista", descricao: "tipos de conteúdo que ele odeia" },
      { id: "soul.odeia.comportamentos", tipo: "lista", descricao: "comportamentos que ele odeia" },
      { id: "soul.odeia.assuntos", tipo: "lista", descricao: "assuntos que ele evita ou odeia" },
      { id: "soul.valoresDefende", tipo: "texto", descricao: "o que ele defende (valores e crenças)" },
      { id: "soul.valoresCombate", tipo: "texto", descricao: "o que ele combate" },
      { id: "soul.medos", tipo: "texto", descricao: "medos" },
      { id: "soul.manias", tipo: "texto", descricao: "manias dele" },
      { id: "soul.defeitos", tipo: "texto", descricao: "defeitos (o que o torna humano e crível)" },
      { id: "soul.origem", tipo: "texto", descricao: "história de origem em 3 a 5 linhas: de onde veio, o que viveu, por que fala desse nicho" },
      { id: "soul.reacoes.elogio", tipo: "texto", descricao: "como reage a elogio" },
      { id: "soul.reacoes.critica", tipo: "texto", descricao: "como reage a crítica" },
      { id: "soul.reacoes.polemica", tipo: "texto", descricao: "como reage a polêmica" },
      { id: "soul.reacoes.hater", tipo: "texto", descricao: "como reage a hater" },
      { id: "soul.regrasConsistencia", tipo: "lista", max: 5, descricao: "5 regras inegociáveis de consistência do personagem" },
    ],
  },
  {
    id: "nicho",
    titulo: "Nicho e Estratégia",
    perguntas: [
      { id: "nicho.principal", tipo: "texto", descricao: "nicho principal" },
      { id: "nicho.subnicho", tipo: "texto", descricao: "subnicho" },
      { id: "nicho.publico", tipo: "texto", descricao: "público-alvo: quem é, idade, dores, desejos" },
      { id: "nicho.promessa", tipo: "texto", descricao: "promessa do perfil em 1 frase ('quem me segue ganha X')" },
      { id: "nicho.performaFormatos", tipo: "lista", opcoes: formatos, soOpcoes: true, descricao: "formatos que mais performam no nicho" },
      { id: "nicho.performaTemas", tipo: "texto", descricao: "temas que mais performam" },
      { id: "nicho.performaGanchos", tipo: "texto", descricao: "ganchos que funcionam" },
      { id: "nicho.performaDuracao", tipo: "texto", descricao: "duração ideal dos conteúdos" },
      { id: "nicho.performaFrequencia", tipo: "texto", descricao: "frequência de postagem" },
      { id: "nicho.performaHorarios", tipo: "texto", descricao: "melhores horários" },
      { id: "nicho.concorrentes", tipo: "lista", max: 5, descricao: "3 a 5 concorrentes/referências no nicho" },
      { id: "nicho.diferencial", tipo: "texto", descricao: "o que ele faz de diferente dos concorrentes" },
      { id: "nicho.plataformas", tipo: "lista", opcoes: plataformas, soOpcoes: true, descricao: "plataformas prioritárias" },
      { id: "nicho.ideiasConteudo", tipo: "ideias", descricao: "10 ideias de posts/vídeos" },
    ],
  },
  {
    id: "voz",
    titulo: "Voz e Linguagem",
    perguntas: [
      { id: "voz.tomFormalidade", tipo: "numero", descricao: "tom de 0 a 100 (0 = formal, 100 = informal)" },
      { id: "voz.tomHumor", tipo: "numero", descricao: "tom de 0 a 100 (0 = sério, 100 = engraçado)" },
      { id: "voz.tomComplexidade", tipo: "numero", descricao: "tom de 0 a 100 (0 = técnico, 100 = simples)" },
      { id: "voz.girias", tipo: "lista", descricao: "gírias e expressões que usa" },
      { id: "voz.bordoes", tipo: "lista", descricao: "bordões" },
      { id: "voz.proibidas", tipo: "lista", descricao: "palavras e expressões que ele NUNCA usaria" },
      { id: "voz.abertura", tipo: "texto", descricao: "como começa os conteúdos" },
      { id: "voz.fechamento", tipo: "texto", descricao: "como termina os conteúdos" },
      { id: "voz.emoji", tipo: "opcao", opcoes: emojiOpcoes.map((e) => e.value), descricao: "uso de emoji" },
      { id: "voz.tamanhoFrase", tipo: "opcao", opcoes: tamanhoFraseOpcoes.map((t) => t.value), descricao: "tamanho médio das frases" },
      { id: "voz.exemplos", tipo: "lista", max: 3, descricao: "3 exemplos de falas/legendas dele, no estilo dele" },
      { id: "voz.vozGenero", tipo: "texto", descricao: "voz (áudio): gênero da voz" },
      { id: "voz.vozTimbre", tipo: "texto", descricao: "voz (áudio): timbre" },
      { id: "voz.vozRitmo", tipo: "texto", descricao: "voz (áudio): ritmo" },
      { id: "voz.vozReferencia", tipo: "texto", descricao: "voz (áudio): referência de voz" },
    ],
  },
  {
    id: "monetizacao",
    titulo: "Monetização e Marcas",
    perguntas: [
      { id: "monetizacao.modelos", tipo: "lista", opcoes: modelosNegocio, soOpcoes: true, descricao: "modelos de negócio" },
      { id: "monetizacao.marcasOk", tipo: "lista", descricao: "tipos de marca que combinam" },
      { id: "monetizacao.marcasNao", tipo: "lista", descricao: "tipos de marca que NÃO combinam" },
      { id: "monetizacao.limites", tipo: "texto", descricao: "limites éticos: o que ele jamais divulgaria" },
      { id: "monetizacao.transparencia", tipo: "texto", descricao: "como e onde avisa que é um personagem sintético" },
    ],
  },
];

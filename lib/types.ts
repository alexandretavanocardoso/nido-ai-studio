export type Genero = "feminino" | "masculino" | "nao-binario";
export type Forma = "humano" | "humanoide" | "animal" | "criatura" | "objeto" | "abstrato";
export type EmojiUso = "nenhum" | "pouco" | "muito";

export interface ReferenciaImagem {
  id: string;
  name: string;
  /** base64 (modo anônimo). Vazio quando a imagem está no S3 (`key`). */
  dataUrl: string;
  size: number;
  /** Key do arquivo no bucket S3 (modo logado com armazenamento ligado). */
  key?: string;
}

/** Imagem gerada pelo Nano Banana e guardada no S3 (galeria do personagem). */
export interface ImagemGerada {
  id: string;
  key: string;
  /** "troca" = foto com a pessoa trocada pelo personagem (Estúdio → Imagens → Trocar pessoa). */
  tipo: "referencia" | "retrato" | "troca";
  estilo: EstiloVisual;
  qualidade: "padrao" | "pro";
  /** Modelo que gerou (lib/ai/modelos-imagem.ts). Ausente = Nano Banana (galerias antigas). */
  modelo?: string;
  size: number;
  createdAt: number;
}

/** Imagem do conjunto de treino da persona (aprovada = entra no treino). */
export interface ImagemTreino {
  id: string;
  key: string;
  aprovada: boolean;
}

/** Fala gerada com a voz do personagem (ElevenLabs), em MP3 no S3. */
export interface AudioArquivo {
  id: string;
  key: string;
  texto: string;
  size: number;
  createdAt: number;
}

/** Figurinha de WhatsApp do personagem (WebP 512×512, fundo transparente), no S3. */
export interface FigurinhaArquivo {
  id: string;
  key: string;
  /** A situação pedida (gerada) ou o nome do arquivo original (substituída). */
  texto: string;
  origem: "gerada" | "substituida";
  size: number;
  createdAt: number;
  /** Figurinha animada (WebP animado): a troca passa pelo motor de vídeo. */
  animada?: boolean;
  /** Job da troca em vídeo (tabela video_jobs), enquanto a animada é feita. */
  jobId?: string;
  status?: "processando" | "erro";
  erro?: string;
}

/** Texto escrito na voz do personagem (legenda, roteiro ou resposta), com as opções geradas. */
export interface TextoEscrito {
  id: string;
  /** legenda | roteiro | resposta */
  tipo: string;
  plataforma: string;
  /** O que foi pedido: o tema do post/vídeo ou o comentário respondido. */
  tema: string;
  opcoes: string[];
  createdAt: number;
}

/** Vídeo no S3: enviado pela pessoa ou gerado pelo app (legenda, troca de pessoa). */
export interface VideoArquivo {
  id: string;
  name: string;
  /** Key no S3. Vazia enquanto o vídeo está sendo gerado (`status: "processando"`). */
  key: string;
  size: number;
  contentType: string;
  createdAt: number;
  /** De onde veio. Ausente = upload (vídeos antigos). */
  origem?: "upload" | "legenda" | "substituicao" | "criado" | "audio";
  /** Vídeo a partir do qual este foi gerado. */
  origemId?: string;
  /** Link de onde veio o vídeo de origem (quando a troca foi feita por link). */
  fonte?: string;
  /** Vídeo original (o trecho que foi trocado), guardado para o "antes e depois". */
  antesKey?: string;
  /** Duração em segundos, quando conhecida. */
  duracao?: number;
  /** Job de troca de pessoa (tabela video_jobs). */
  jobId?: string;
  status?: "processando" | "erro";
  erro?: string;
}

export interface Identidade {
  nome: string;
  handles?: string[];
  ocupacao?: string;
  genero?: Genero;
  forma?: Forma;
  idadeAparente?: string;
  cidade?: string;
  idioma?: string;
  sotaque?: string;
  bio?: string;
}

export interface Visual {
  referencias: ReferenciaImagem[];
  /** Capa escolhida (key no S3). Sem ela: o retrato gerado mais recente, senão a 1ª referência. */
  capaKey?: string;
  cabelo?: string;
  pele?: string;
  olhos?: string;
  roupa?: string;
  acessorios?: string;
  tracosMarcantes?: string;
  paleta?: string;
  cenarios?: string;
  /** Ideia visual em texto livre; vai pro topo do prompt de imagem, antes dos campos. */
  ideiaLivre?: string;
  /** Estilo de render das imagens geradas. Padrão: "realista". */
  estilo?: EstiloVisual;
}

export type EstiloVisual = "realista" | "3d";

export interface Soul {
  arquetipo?: string;
  adjetivos: string[];
  gostos: {
    comidas: string[];
    musicas: string[];
    hobbies: string[];
    marcas: string[];
    lugares: string[];
    series: string[];
  };
  odeia: {
    manias: string[];
    conteudos: string[];
    comportamentos: string[];
    assuntos: string[];
  };
  valoresDefende?: string;
  valoresCombate?: string;
  medos?: string;
  manias?: string;
  defeitos?: string;
  origem?: string;
  reacoes: {
    elogio?: string;
    critica?: string;
    polemica?: string;
    hater?: string;
  };
  regrasConsistencia: string[];
}

export interface IdeiaConteudo {
  formato: string;
  titulo: string;
  descricao?: string;
}

export interface Nicho {
  principal?: string;
  subnicho?: string;
  publico?: string;
  promessa?: string;
  performaFormatos: string[];
  performaTemas?: string;
  performaGanchos?: string;
  performaDuracao?: string;
  performaFrequencia?: string;
  performaHorarios?: string;
  concorrentes: string[];
  diferencial?: string;
  plataformas: string[];
  ideiasConteudo: IdeiaConteudo[];
}

export interface Voz {
  tomFormalidade: number;
  tomHumor: number;
  tomComplexidade: number;
  girias: string[];
  bordoes: string[];
  proibidas: string[];
  abertura?: string;
  fechamento?: string;
  emoji: EmojiUso;
  tamanhoFrase: "curtas" | "medias" | "longas";
  exemplos: string[];
  vozGenero?: string;
  vozTimbre?: string;
  vozRitmo?: string;
  vozReferencia?: string;
}

export interface Monetizacao {
  modelos: string[];
  marcasOk: string[];
  marcasNao: string[];
  limites?: string;
  transparencia?: string;
}

export interface PontoEmAberto {
  decisao: string;
  porQueImporta: string;
  resposta?: string;
}

export interface HistoryEntry {
  at: number;
  label: string;
  snapshot: SerializableCharacter;
}

/** Snapshot sem metadados de IA — usado em _history pra evitar recursão. */
export type SerializableCharacter = Omit<Character, "_history">;

export interface Character {
  id: string;
  createdAt: number;
  updatedAt: number;
  identidade: Identidade;
  visual: Visual;
  soul: Soul;
  nicho: Nicho;
  voz: Voz;
  monetizacao: Monetizacao;
  pontosEmAberto: PontoEmAberto[];
  /**
   * Radar diário (lib/radar): desligado por padrão — gasta créditos todo dia.
   * `temas` são assuntos extras além do nicho da ficha; `comX` inclui o que está em alta no X.
   */
  radar?: { ativo: boolean; comX: boolean; temas: string[]; idioma?: "pt" | "en" };
  /** Vídeos de origem no S3. Opcional: personagens antigos não têm. */
  videos?: VideoArquivo[];
  /** Galeria das imagens geradas (só com S3; mais recentes primeiro, até 30). */
  geradas?: ImagemGerada[];
  /**
   * Conjunto de imagens para treinar a persona. O modelo treinado em si fica
   * no servidor (tabela personas_treino) — a geração busca de lá.
   */
  personaDataset?: ImagemTreino[];
  /** Falas geradas com a voz do personagem. A voz fica na tabela `vozes`. */
  audios?: AudioArquivo[];
  /** Textos escritos em Estúdio → Textos, salvos na hora (mais recentes primeiro, até 30). */
  textos?: TextoEscrito[];
  /** Figurinhas de WhatsApp criadas em Estúdio → Figurinhas (mais recentes primeiro). */
  figurinhas?: FigurinhaArquivo[];
  /** Voz pronta escolhida na biblioteca da ElevenLabs (as criadas/clonadas ficam na tabela `vozes`). */
  vozBiblioteca?: { voiceId: string; nome: string; previewUrl?: string };
  /** fieldId → "contexto"|"suposicao". Enquanto estiver aqui, o campo mostra badge. */
  _suggestions: Record<string, "contexto" | "suposicao">;
  /** fieldIds travados: nunca sobrescritos por regeneração. */
  _locks: string[];
  /** Snapshots das últimas gerações, pra Desfazer. */
  _history: HistoryEntry[];
}

export const STEP_IDS = [
  "identidade",
  "visual",
  "soul",
  "nicho",
  "voz",
  "monetizacao",
  "revisao",
] as const;

export type StepId = (typeof STEP_IDS)[number];

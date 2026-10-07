import type { Forma, Genero } from "@/lib/types";

export const generos: { value: Genero; label: string; emoji: string }[] = [
  { value: "feminino", label: "Feminino", emoji: "♀" },
  { value: "masculino", label: "Masculino", emoji: "♂" },
  { value: "nao-binario", label: "Não-binário", emoji: "⚧" },
];

export const formas: { value: Forma; label: string; descricao: string }[] = [
  { value: "humano", label: "Humano", descricao: "Pessoa realista com proporções humanas." },
  { value: "humanoide", label: "Humanoide", descricao: "Quase humano, com algo que foge do padrão." },
  { value: "animal", label: "Animal", descricao: "Um bicho que fala, posta e vive." },
  { value: "criatura", label: "Criatura", descricao: "Ser fantástico, mitológico ou inventado." },
  { value: "objeto", label: "Objeto", descricao: "Um objeto antropomorfizado com voz própria." },
  { value: "abstrato", label: "Abstrato", descricao: "Forma geométrica, mancha, símbolo." },
];

export const arquetipos = [
  "Mentor",
  "Amigo debochado",
  "Especialista sério",
  "Rebelde",
  "Acolhedor",
  "Curador",
  "Provocador",
  "Entertainer",
  "Técnico",
  "Visionário",
];

export const plataformas = [
  "Instagram",
  "TikTok",
  "YouTube",
  "YouTube Shorts",
  "X",
  "Kwai",
  "Threads",
  "LinkedIn",
];

export const formatos = ["Reels", "Carrossel", "Shorts", "Lives", "Vídeo longo", "Thread", "Post estático"];

export const modelosNegocio = [
  "Publis",
  "Afiliados",
  "Produto próprio",
  "Comunidade paga",
  "Assinatura",
  "Mentoria",
  "Curso",
];

export const emojiOpcoes = [
  { value: "nenhum", label: "Nenhum" },
  { value: "pouco", label: "Pouco" },
  { value: "muito", label: "Muito" },
] as const;

export const tamanhoFraseOpcoes = [
  { value: "curtas", label: "Curtas" },
  { value: "medias", label: "Médias" },
  { value: "longas", label: "Longas" },
] as const;

import {
  BadgeDollarSign,
  CheckCheck,
  Heart,
  MessageSquare,
  Palette,
  Target,
  User,
  type LucideIcon,
} from "lucide-react";
import type { StepId } from "@/lib/types";

export interface StepConfig {
  id: StepId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  dica: string;
}

/**
 * Config das 7 etapas. Para adicionar/alterar perguntas, edite este arquivo
 * e o componente correspondente em components/steps/<StepId>.tsx.
 */
export const STEPS: StepConfig[] = [
  {
    id: "identidade",
    title: "Identidade",
    subtitle: "Quem é esse personagem",
    icon: User,
    dica:
      "Comece pelo essencial: um nome fácil de lembrar e uma frase que resume o personagem. Exemplo: “Lila, uma arquiteta de interiores que detesta minimalismo frio.”",
  },
  {
    id: "visual",
    title: "Visual",
    subtitle: "Como ele aparece",
    icon: Palette,
    dica:
      "Imagens de referência valem mais que mil palavras. Suba fotos de pessoas, moodboards ou prints de obras com a vibe que você quer — e descreva no que elas se parecem com o personagem.",
  },
  {
    id: "soul",
    title: "Personalidade",
    subtitle: "A alma dele",
    icon: Heart,
    dica:
      "Personagens memoráveis são contraditórios. Mentor que é inseguro. Debochado que é generoso. Liste gostos específicos (não ‘comida boa’, mas ‘pastel de feira na sexta à noite’).",
  },
  {
    id: "nicho",
    title: "Nicho e Estratégia",
    subtitle: "Onde ele brilha",
    icon: Target,
    dica:
      "Escreva a promessa como se fosse a bio do perfil: “Quem me segue aprende X em Y.” Depois, estude 3 referências do nicho e nota o que elas fazem bem — isso vira a régua.",
  },
  {
    id: "voz",
    title: "Voz e Linguagem",
    subtitle: "Como ele fala",
    icon: MessageSquare,
    dica:
      "Escreva 3 falas no tom dele. Leia em voz alta. Se soar como um robô ou como você forçando, troque. Bordões curtos e repetíveis grudam mais que frases bonitas.",
  },
  {
    id: "monetizacao",
    title: "Monetização e Marcas",
    subtitle: "Com o que ele vive",
    icon: BadgeDollarSign,
    dica:
      "O que o personagem jamais divulgaria é mais importante que a lista do que divulgaria. Isso define a confiança do público. E seja claro sobre a transparência: ele é sintético, e isso tem que aparecer.",
  },
  {
    id: "revisao",
    title: "Revisão",
    subtitle: "Checklist e ficha final",
    icon: CheckCheck,
    dica:
      "Leia a ficha como se fosse apresentar o personagem numa reunião. Se um campo deixa dúvida, volte e refine — tudo o que o Estúdio gera (imagens, vídeos, textos) parte desta ficha.",
  },
];

export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);

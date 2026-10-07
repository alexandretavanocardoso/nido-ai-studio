import { z } from "zod";

/**
 * Envelope padrão de um campo gerado pela IA: `{ valor, origem }`.
 * `origem` diz se o conteúdo veio do contexto curto do usuário ou é suposição
 * da IA — a UI usa isso para marcar o campo como "Sugestão da IA".
 */
export const origemSchema = z.enum(["contexto", "suposicao"]);

export function envelope<T extends z.ZodTypeAny>(valor: T) {
  return z
    .object({
      valor,
      // Origem fora do combinado ("inferido", "ia"…) vira suposição em vez de derrubar a resposta.
      origem: origemSchema.optional().default("suposicao").catch("suposicao"),
    })
    .passthrough();
}

// Tolerante ao formato: a IA às vezes manda lista onde é texto (e vice-versa)
// ou número como texto. Um campo fora do tipo não pode derrubar a etapa inteira.
const texto = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.map(String).join("; ")
      : typeof v === "number"
        ? String(v)
        : v,
  z.string(),
);
const lista = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(/\n|;/)
          .map((x) => x.replace(/^[-•\s]+/, "").trim())
          .filter(Boolean)
      : v,
  z.array(z.string()),
);
const numero = z.preprocess(
  (v) =>
    typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))
      ? Number(v)
      : v,
  z.number(),
);
const str = envelope(texto);
const strArr = envelope(lista);
const num = envelope(numero);

const generoSchema = z.enum(["feminino", "masculino", "nao-binario"]);
const formaSchema = z.enum([
  "humano",
  "humanoide",
  "animal",
  "criatura",
  "objeto",
  "abstrato",
]);
const identidadeSchema = z
  .object({
    nome: str.optional(),
    handles: strArr.optional(),
    ocupacao: str.optional(),
    idadeAparente: str.optional(),
    cidade: str.optional(),
    idioma: str.optional(),
    sotaque: str.optional(),
    genero: envelope(generoSchema).optional(),
    forma: envelope(formaSchema).optional(),
    bio: str.optional(),
  })
  .partial()
  .passthrough();

const visualSchema = z
  .object({
    cabelo: str.optional(),
    pele: str.optional(),
    olhos: str.optional(),
    roupa: str.optional(),
    acessorios: str.optional(),
    tracosMarcantes: str.optional(),
    paleta: str.optional(),
    cenarios: str.optional(),
  })
  .partial()
  .passthrough();

const gostosSchema = z
  .object({
    comidas: strArr.optional(),
    musicas: strArr.optional(),
    hobbies: strArr.optional(),
    marcas: strArr.optional(),
    lugares: strArr.optional(),
    series: strArr.optional(),
  })
  .partial();
const odeiaSchema = z
  .object({
    manias: strArr.optional(),
    conteudos: strArr.optional(),
    comportamentos: strArr.optional(),
    assuntos: strArr.optional(),
  })
  .partial();
const reacoesSchema = z
  .object({
    elogio: str.optional(),
    critica: str.optional(),
    polemica: str.optional(),
    hater: str.optional(),
  })
  .partial();

const soulSchema = z
  .object({
    arquetipo: str.optional(),
    adjetivos: strArr.optional(),
    gostos: gostosSchema.optional(),
    odeia: odeiaSchema.optional(),
    valoresDefende: str.optional(),
    valoresCombate: str.optional(),
    medos: str.optional(),
    manias: str.optional(),
    defeitos: str.optional(),
    origem: str.optional(),
    reacoes: reacoesSchema.optional(),
    regrasConsistencia: strArr.optional(),
  })
  .partial()
  .passthrough();

const ideiaSchema = z.object({
  // A IA às vezes omite o formato da ideia: não pode derrubar a etapa toda.
  formato: texto.optional().default("Post"),
  titulo: texto,
  descricao: z.string().optional().default(""),
});

const nichoSchema = z
  .object({
    principal: str.optional(),
    subnicho: str.optional(),
    publico: str.optional(),
    promessa: str.optional(),
    performaFormatos: strArr.optional(),
    performaTemas: str.optional(),
    performaGanchos: str.optional(),
    performaDuracao: str.optional(),
    performaFrequencia: str.optional(),
    performaHorarios: str.optional(),
    concorrentes: strArr.optional(),
    diferencial: str.optional(),
    plataformas: strArr.optional(),
    ideiasConteudo: envelope(z.array(ideiaSchema)).optional(),
  })
  .partial()
  .passthrough();

const vozSchema = z
  .object({
    tomFormalidade: num.optional(),
    tomHumor: num.optional(),
    tomComplexidade: num.optional(),
    girias: strArr.optional(),
    bordoes: strArr.optional(),
    proibidas: strArr.optional(),
    abertura: str.optional(),
    fechamento: str.optional(),
    emoji: envelope(z.enum(["nenhum", "pouco", "muito"])).optional(),
    tamanhoFrase: envelope(z.enum(["curtas", "medias", "longas"])).optional(),
    exemplos: strArr.optional(),
    vozGenero: str.optional(),
    vozTimbre: str.optional(),
    vozRitmo: str.optional(),
  })
  .partial()
  .passthrough();

const monetizacaoSchema = z
  .object({
    modelos: strArr.optional(),
    marcasOk: strArr.optional(),
    marcasNao: strArr.optional(),
    limites: str.optional(),
    transparencia: str.optional(),
  })
  .partial()
  .passthrough();

const pontoAbertoSchema = z.object({
  decisao: z.string(),
  porQueImporta: z.string(),
});

export const expandirRespostaSchema = z
  .object({
    identidade: identidadeSchema.optional(),
    visual: visualSchema.optional(),
    soul: soulSchema.optional(),
    nicho: nichoSchema.optional(),
    voz: vozSchema.optional(),
    monetizacao: monetizacaoSchema.optional(),
    pontosEmAberto: z.array(pontoAbertoSchema).optional(),
  })
  .passthrough();

export type ExpandirResposta = z.infer<typeof expandirRespostaSchema>;

export const alertaIASchema = z.object({
  tipo: z.enum(["contradicao", "cliche", "generico", "vazio"]),
  campo: z.string(),
  mensagem: z.string(),
  correcaoSugerida: z.string().optional(),
});
export const checarRespostaSchema = z.object({
  alertas: z.array(alertaIASchema),
});
export type AlertaIA = z.infer<typeof alertaIASchema>;

export const sugerirCampoRespostaSchema = z.object({ valor: z.unknown() });

export { extractJson } from "@/lib/extract-json";

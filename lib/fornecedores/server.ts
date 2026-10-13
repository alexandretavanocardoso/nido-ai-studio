import { nanoid } from "nanoid";
import { z } from "zod";
import { askJson } from "@/lib/ai/parse";
import { getPool } from "@/lib/db";
import { pesquisarCategoria } from "./pesquisar";
import {
  ANOTACOES_MAX,
  CATEGORIAS,
  chaveFornecedor,
  STATUS_FORNECEDOR,
  type Abordagem,
  type Categoria,
  type EmpresaAchada,
  type Fonte,
  type Fornecedor,
  type FornecedoresAdmin,
  type IdiomaAbordagem,
  type ResumoPesquisa,
  type StatusFornecedor,
  type TemApi,
} from "./tipos";

/**
 * Radar de fornecedores de IA (tabelas fornecedores_ia e fornecedores_ia_buscas,
 * migration 0035). Server-side apenas.
 *
 *  - Uma pesquisa por categoria (lib/fornecedores/pesquisar.ts) grava as
 *    empresas que ainda não estavam na lista; as que já estavam ficam como o
 *    admin deixou (status, anotações, rascunho).
 *  - O contato é feito à mão, pelo LinkedIn: aqui só sai o rascunho.
 */

/** Erro com mensagem para mostrar ao admin. */
export class FornecedorError extends Error {}

function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

interface Linha {
  id: string;
  nome: string;
  pais: string | null;
  categorias: Categoria[];
  oferece: string;
  api: TemApi;
  preco: string | null;
  site: string | null;
  linkedin: string | null;
  pessoas: string | null;
  porque: string;
  nota: number;
  fontes: Fonte[];
  status: StatusFornecedor;
  anotacoes: string | null;
  abordagem: Abordagem | null;
  created_at: Date;
}

const COLUNAS =
  "id, nome, pais, categorias, oferece, api, preco, site, linkedin, pessoas, porque, nota, fontes, status, anotacoes, abordagem, created_at";

const paraFornecedor = (l: Linha): Fornecedor => ({
  id: l.id,
  nome: l.nome,
  pais: l.pais,
  categorias: l.categorias ?? [],
  oferece: l.oferece,
  api: l.api,
  preco: l.preco,
  site: l.site,
  linkedin: l.linkedin,
  pessoas: l.pessoas,
  porque: l.porque,
  nota: l.nota,
  fontes: l.fontes ?? [],
  status: l.status,
  anotacoes: l.anotacoes,
  abordagem: l.abordagem,
  criadoEm: new Date(l.created_at).toISOString(),
});

const ehStatus = (s: string | undefined): s is StatusFornecedor =>
  STATUS_FORNECEDOR.includes(s as StatusFornecedor);

/** Fornecedores para a área admin, melhor nota primeiro (até 200). */
export async function listarFornecedores(
  status?: string,
): Promise<FornecedoresAdmin> {
  const filtro = ehStatus(status) ? status : null;
  const [lista, totais, ultima] = await Promise.all([
    pool().query<Linha>(
      `select ${COLUNAS} from fornecedores_ia
        where ($1::text is null or status = $1)
        order by nota desc, created_at desc
        limit 200`,
      [filtro],
    ),
    pool().query<{ status: string; n: number }>(
      "select status, count(*)::int as n from fornecedores_ia group by status",
    ),
    pool().query<{ quando: Date | null }>(
      // Só a que deu certo: uma tentativa que falhou não é "a última pesquisa".
      "select max(created_at) as quando from fornecedores_ia_buscas where erro is null",
    ),
  ]);
  const quando = ultima.rows[0]?.quando;
  return {
    itens: lista.rows.map(paraFornecedor),
    totais: totais.rows,
    ultimaBusca: quando ? new Date(quando).toISOString() : null,
  };
}

/**
 * Grava as empresas de uma pesquisa. Quem já estava na lista (mesmo domínio)
 * só tem a data atualizada. Devolve quantas são novas.
 */
export async function salvarAchados(empresas: EmpresaAchada[]): Promise<number> {
  let novos = 0;
  for (const e of empresas) {
    const chave = chaveFornecedor(e.nome, e.site);
    if (!chave) continue;
    const { rows } = await pool().query<{ novo: boolean }>(
      `insert into fornecedores_ia
         (id, chave, nome, pais, categorias, oferece, api, preco, site, linkedin, pessoas, porque, nota, fontes)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       on conflict (chave) do update set visto_em = now()
       returning (xmax = 0) as novo`,
      [
        nanoid(12),
        chave,
        e.nome,
        e.pais,
        JSON.stringify(e.categorias),
        e.oferece,
        e.api,
        e.preco,
        e.site,
        e.linkedin,
        e.pessoas,
        e.porque,
        e.nota,
        JSON.stringify(e.fontes),
      ],
    );
    if (rows[0]?.novo) novos++;
  }
  return novos;
}

/** Categorias sem pesquisa que deu certo nos últimos `dias` (para o cron não pagar duas vezes). */
export async function categoriasPendentes(dias = 6): Promise<Categoria[]> {
  const { rows } = await pool().query<{ categoria: string }>(
    `select distinct categoria from fornecedores_ia_buscas
      where erro is null and created_at > now() - make_interval(days => $1)`,
    [dias],
  );
  const feitas = new Set(rows.map((r) => r.categoria));
  return CATEGORIAS.filter((c) => !feitas.has(c));
}

/**
 * Roda o agente nas categorias pedidas, ao mesmo tempo, e grava o que achou.
 * Uma categoria que falha não derruba as outras: fica registrada com o erro.
 */
export async function pesquisarFornecedores(
  categorias: readonly Categoria[] = CATEGORIAS,
): Promise<ResumoPesquisa> {
  const { rows } = await pool().query<{ nome: string }>(
    "select nome from fornecedores_ia order by created_at desc limit 300",
  );
  const conhecidas = rows.map((r) => r.nome);
  const hoje = new Date().toISOString().slice(0, 10);
  const resumo: ResumoPesquisa = { achados: 0, novos: 0, usd: 0, falhas: [] };

  await Promise.all(
    categorias.map(async (categoria) => {
      let achados = 0;
      let novos = 0;
      let usd = 0;
      let erro: string | null = null;
      try {
        const r = await pesquisarCategoria({ categoria, conhecidas, hoje });
        usd = r.custo.usd;
        achados = r.empresas.length;
        novos = await salvarAchados(r.empresas);
      } catch (e) {
        erro = (e as Error).message.slice(0, 500);
        console.error("[fornecedores]", categoria, erro);
        resumo.falhas.push({ categoria, erro });
      }
      resumo.achados += achados;
      resumo.novos += novos;
      resumo.usd += usd;
      await pool().query(
        `insert into fornecedores_ia_buscas (id, categoria, achados, novos, custo_usd, erro)
         values ($1, $2, $3, $4, $5, $6)`,
        [nanoid(12), categoria, achados, novos, usd.toFixed(4), erro],
      );
    }),
  );
  return resumo;
}

/** Muda o status ou as anotações de um fornecedor. */
export async function atualizarFornecedor(
  id: string,
  mudanca: { status: StatusFornecedor } | { anotacoes: string },
): Promise<Fornecedor> {
  const { rows } =
    "status" in mudanca
      ? await pool().query<Linha>(
          `update fornecedores_ia set status = $2 where id = $1 returning ${COLUNAS}`,
          [id, mudanca.status],
        )
      : await pool().query<Linha>(
          `update fornecedores_ia set anotacoes = $2 where id = $1 returning ${COLUNAS}`,
          [id, mudanca.anotacoes.trim().slice(0, ANOTACOES_MAX) || null],
        );
  if (!rows[0]) throw new FornecedorError("Fornecedor não encontrado.");
  return paraFornecedor(rows[0]);
}

/** Limites do LinkedIn: a nota do convite na conta grátis tem 200 caracteres. */
const CONVITE_MAX = 200;
const MENSAGEM_MAX = 900;

const abordagemSchema = z.object({
  convite: z.string().min(1),
  mensagem: z.string().min(1),
});

/** Escreve (ou reescreve) o rascunho de abordagem pelo LinkedIn e guarda na ficha. */
export async function gerarAbordagem(
  id: string,
  idioma: IdiomaAbordagem,
): Promise<Fornecedor> {
  const { rows } = await pool().query<Linha>(
    `select ${COLUNAS} from fornecedores_ia where id = $1`,
    [id],
  );
  const f = rows[0];
  if (!f) throw new FornecedorError("Fornecedor não encontrado.");

  const r = await askJson({
    system:
      "Você escreve mensagens curtas de primeiro contato comercial pelo LinkedIn. Tom direto e profissional, de quem respeita o tempo do outro: sem bajulação, sem frases feitas, sem promessa que não pode cumprir.",
    user: [
      "[QUEM ENVIA]",
      "Alguém da equipe do NIDO AI Studio (aistudio.nido.global): plataforma brasileira em que criadores e marcas criam e operam influenciadores virtuais (personagem com rosto consistente, imagens, vídeos, voz) e publicam nas redes. O NIDO compra geração de IA por API e revende em créditos.",
      "",
      "[PARA QUEM]",
      `Empresa: ${f.nome}${f.pais ? ` (${f.pais})` : ""}`,
      `O que vende: ${f.oferece}`,
      `Por que interessa ao NIDO: ${f.porque}`,
      "",
      "[OBJETIVO]",
      "Abrir uma conversa sobre parceria comercial: preço por volume, acesso antecipado a modelos e, se fizer sentido, distribuição do modelo deles no Brasil e na América Latina pelo NIDO.",
      "",
      "[REGRAS]",
      `- "convite": nota do convite de conexão, com no máximo ${CONVITE_MAX} caracteres.`,
      `- "mensagem": para enviar depois que a pessoa aceitar, com no máximo ${MENSAGEM_MAX} caracteres. Diga em uma frase o que é o NIDO, por que a empresa dela em particular interessa, e termine pedindo uma conversa de 20 minutos ou o contato de quem cuida de parcerias.`,
      "- Não invente números do NIDO (usuários, volume, faturamento) nem fatos sobre a empresa além dos que estão acima.",
      "- Sem assinatura e sem campos para preencher: o LinkedIn já mostra quem envia.",
      idioma === "zh"
        ? "- Escreva em chinês simplificado, no registro de negócios (您)."
        : "- Escreva em inglês.",
      "",
      "[SAÍDA]",
      'Responda APENAS com o JSON: {"convite": "...", "mensagem": "..."}',
    ].join("\n"),
    schema: abordagemSchema,
    maxTokens: 1500,
  });
  const abordagem: Abordagem = {
    idioma,
    convite: r.convite.trim().slice(0, CONVITE_MAX),
    mensagem: r.mensagem.trim().slice(0, MENSAGEM_MAX),
  };
  const salvo = await pool().query<Linha>(
    `update fornecedores_ia set abordagem = $2::jsonb where id = $1 returning ${COLUNAS}`,
    [id, JSON.stringify(abordagem)],
  );
  return paraFornecedor(salvo.rows[0]);
}

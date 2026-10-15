import { randomBytes } from "node:crypto";
import type { Pool } from "@neondatabase/serverless";
import type { InputMotion, ProgressoMotion, TipoMotion, UsoMotion } from "./tipos";

/**
 * A fila do Motion é a própria tabela `motions` (db/migrations/0041). Cada
 * processo pega um trabalho com `for update skip locked` e dá sinal de vida;
 * parado há 10 min, outro processo pega de novo do começo.
 */
const PRAZO_SINAL_MIN = 10;

export interface TrabalhoMotion {
  id: string;
  userId: string;
  /** O que fazer: gerar o HTML ou gravar o vídeo. */
  acao: "gerar" | "gravar";
  tipo: TipoMotion;
  modelo: string;
  esforco: string | null;
  input: InputMotion;
  htmlKey: string | null;
}

export async function pegarTrabalho(pool: Pool): Promise<TrabalhoMotion | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    status: string;
    render: string | null;
    tipo: TipoMotion;
    modelo: string;
    esforco: string | null;
    input: InputMotion;
    html_key: string | null;
  }>(
    `update motions set
       status = case when status = 'na_fila' or (status = 'gerando' and vivo_em < now() - interval '${PRAZO_SINAL_MIN} minutes') then 'gerando' else status end,
       render = case when status = 'pronto' and (render = 'na_fila' or (render = 'renderizando' and vivo_em < now() - interval '${PRAZO_SINAL_MIN} minutes')) then 'renderizando' else render end,
       vivo_em = now(), updated_at = now()
     where id = (
       select id from motions
        where status = 'na_fila'
           or (status = 'pronto' and render = 'na_fila')
           or ((status = 'gerando' or (status = 'pronto' and render = 'renderizando'))
               and vivo_em < now() - interval '${PRAZO_SINAL_MIN} minutes')
        order by created_at
        limit 1
        for update skip locked)
     returning id, user_id, status, render, tipo, modelo, esforco, input, html_key`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    acao: r.status === "gerando" ? "gerar" : "gravar",
    tipo: r.tipo,
    modelo: r.modelo,
    esforco: r.esforco,
    input: r.input,
    htmlKey: r.html_key,
  };
}

/** Só o sinal de vida do trabalho (enquanto o modelo pensa, por exemplo). */
export async function sinal(pool: Pool, id: string): Promise<void> {
  await pool.query("update motions set vivo_em = now() where id = $1", [id]);
}

/** Sinal de vida do trabalho e o andamento que a tela mostra. */
export async function andamento(pool: Pool, id: string, p: ProgressoMotion | null): Promise<void> {
  await pool.query("update motions set vivo_em = now(), progresso = $2, updated_at = now() where id = $1", [
    id,
    p ? JSON.stringify(p) : null,
  ]);
}

/** Guarda o que o worker acrescentou ao pedido (a leitura do site e as capturas). */
export async function salvarInput(pool: Pool, id: string, input: InputMotion): Promise<void> {
  await pool.query("update motions set input = $2, updated_at = now() where id = $1", [id, JSON.stringify(input)]);
}

export async function concluirGeracao(pool: Pool, id: string, htmlKey: string, uso: UsoMotion): Promise<void> {
  await pool.query(
    `update motions set status = 'pronto', html_key = $2, uso = $3, progresso = null, error = null, vivo_em = null, updated_at = now()
     where id = $1`,
    [id, htmlKey, JSON.stringify(uso)],
  );
}

export async function falharGeracao(pool: Pool, id: string, erro: string, uso?: UsoMotion): Promise<void> {
  await pool.query(
    `update motions set status = 'erro', error = $2, uso = coalesce($3, uso), progresso = null, vivo_em = null, updated_at = now()
     where id = $1`,
    [id, erro, uso ? JSON.stringify(uso) : null],
  );
}

export async function concluirGravacao(pool: Pool, id: string, videoKey: string): Promise<void> {
  await pool.query(
    `update motions set render = 'pronto', video_key = $2, render_erro = null, progresso = null, vivo_em = null, updated_at = now()
     where id = $1`,
    [id, videoKey],
  );
}

export async function falharGravacao(pool: Pool, id: string, erro: string): Promise<void> {
  await pool.query(
    `update motions set render = 'erro', render_erro = $2, progresso = null, vivo_em = null, updated_at = now() where id = $1`,
    [id, erro],
  );
}

/**
 * Aviso no sino do app (tabela avisos, a mesma de lib/avisos-server.ts): vale
 * com o app fechado. A `chave` evita aviso repetido; a conta guarda os 30 mais novos.
 */
export async function avisar(
  pool: Pool,
  userId: string,
  a: { rotulo: string; erro?: boolean; href: string; chave: string },
): Promise<void> {
  try {
    const { rowCount } = await pool.query(
      `insert into avisos (id, user_id, rotulo, erro, href, chave)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, chave) do nothing`,
      [randomBytes(9).toString("base64url"), userId, a.rotulo.slice(0, 200), !!a.erro, a.href, a.chave.slice(0, 120)],
    );
    if (rowCount)
      await pool.query(
        `delete from avisos where user_id = $1 and id not in (
           select id from avisos where user_id = $1 order by criado_em desc limit 30
         )`,
        [userId],
      );
  } catch (e) {
    console.warn("[motion] aviso não registrado:", (e as Error).message);
  }
}

/** Sinal de vida do processo (também parado): a tela avisa quando ele não está ligado. */
export async function processoVivo(pool: Pool, processo: string): Promise<void> {
  await pool.query(
    `insert into motion_worker (id, vivo_em) values ($1, now())
     on conflict (id) do update set vivo_em = now()`,
    [processo],
  );
}

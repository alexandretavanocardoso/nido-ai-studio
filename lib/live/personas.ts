import type { Pool } from "@neondatabase/serverless";
import type { CenaLive, PersonaAvulsa, PersonaSalva } from "./tipos";

/**
 * Personas avulsas salvas: saem das lives sem personagem da conta. A mesma
 * persona (mesma foto e mesmo nome) aparece uma vez só, com a descrição, a
 * voz e o cenário da live mais recente. "Tirar da lista" marca `oculta` nas
 * lives dela; usar de novo numa live nova faz voltar.
 */
export async function personasSalvas(pool: Pool, userId: string): Promise<PersonaSalva[]> {
  const { rows } = await pool.query<{
    persona: PersonaAvulsa;
    image_key: string;
    voice_id: string;
    cena: CenaLive | null;
  }>(
    `select * from (
       select distinct on (image_key, persona->>'nome') persona, image_key, voice_id, cena, created_at
         from lives
        where user_id = $1 and persona is not null
        order by image_key, persona->>'nome', created_at desc
     ) p
     where not coalesce((persona->>'oculta')::boolean, false)
     order by created_at desc
     limit 20`,
    [userId],
  );
  return rows.map((r) => ({
    nome: r.persona.nome,
    descricao: r.persona.descricao,
    vozNome: r.persona.vozNome,
    imageKey: r.image_key,
    voiceId: r.voice_id,
    cena: r.cena,
  }));
}

/** Tira a persona da lista (as lives dela continuam no histórico). */
export async function esconderPersona(
  pool: Pool,
  userId: string,
  p: Pick<PersonaSalva, "imageKey" | "nome">,
): Promise<void> {
  await pool.query(
    `update lives set persona = persona || '{"oculta": true}'::jsonb
      where user_id = $1 and image_key = $2 and persona->>'nome' = $3`,
    [userId, p.imageKey, p.nome],
  );
}

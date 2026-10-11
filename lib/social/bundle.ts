import { Bundlesocial } from "bundlesocial";
import { getPool } from "@/lib/db";
import { INFO_REDES, REDES, type Rede, type TipoMidia } from "./redes";

/**
 * bundle.social: uma API para publicar/agendar em várias redes.
 *  - Organização (a conta da NIDO, chave em BUNDLE_SOCIAL) → um "time" por
 *    influencer (cada influencer tem as próprias contas sociais).
 *  - Conectar conta: link do portal hospedado (OAuth da rede, escolha de
 *    canal/página) — volta pro app.
 *  - Post: a mídia sai do S3 por URL pré-assinada (upload/from-url) e o post
 *    é criado como SCHEDULED (data no futuro = agendado; agora = publica já).
 *  - Resultado: webhook post.published (+ consulta ao abrir a tela).
 * Server-side apenas.
 */
let client: Bundlesocial | null = null;

export function chaveBundle(): string | null {
  return process.env.BUNDLE_SOCIAL?.trim() || process.env.BUNDLE_SOCIAL_API_KEY?.trim() || null;
}

export function getBundle(): Bundlesocial | null {
  const key = chaveBundle();
  if (!key) return null;
  if (!client) client = new Bundlesocial(key);
  return client;
}

/** Mensagem em português para erros da API do bundle.social. */
export function mensagemBundle(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const corpo = (e as { body?: { message?: string } })?.body?.message;
  if (status === 401 || status === 403) return "Chave do bundle.social inválida (BUNDLE_SOCIAL).";
  if (status === 429) return "Muitas chamadas ao bundle.social. Tente de novo em instantes.";
  if (status === 402 || /limit|plan|quota/i.test(corpo ?? ""))
    return `Limite do plano do bundle.social atingido${corpo ? `: ${corpo}` : "."}`;
  return corpo ? `bundle.social: ${corpo}` : "Falha ao falar com o bundle.social.";
}

/** Time do influencer no bundle.social (cria na primeira vez). */
export async function garantirTime(
  bundle: Bundlesocial,
  userId: string,
  characterId: string,
  nome: string,
): Promise<string> {
  const pool = getPool()!;
  const { rows } = await pool.query<{ team_id: string }>(
    "select team_id from social_times where user_id = $1 and character_id = $2",
    [userId, characterId],
  );
  if (rows[0]) return rows[0].team_id;
  const time = await bundle.team.teamCreateTeam({
    requestBody: { name: `${(nome || "Personagem").slice(0, 40)} · ${userId.slice(0, 6)}` },
  });
  // Corrida (duas abas): fica o primeiro; o time extra é apagado.
  const { rows: gravado } = await pool.query<{ team_id: string }>(
    `insert into social_times (user_id, character_id, team_id) values ($1, $2, $3)
     on conflict (user_id, character_id) do update set user_id = excluded.user_id returning team_id`,
    [userId, characterId, time.id],
  );
  if (gravado[0].team_id !== time.id) await bundle.team.teamDeleteTeam({ id: time.id }).catch(() => {});
  return gravado[0].team_id;
}

/** Time já existente (sem criar). */
export async function timeDoPersonagem(userId: string, characterId: string): Promise<string | null> {
  const { rows } = await getPool()!.query<{ team_id: string }>(
    "select team_id from social_times where user_id = $1 and character_id = $2",
    [userId, characterId],
  );
  return rows[0]?.team_id ?? null;
}

export interface ContaSocial {
  rede: Rede;
  usuario: string | null;
  nome: string | null;
  avatar: string | null;
  /** Id da conta na própria rede (não muda se a pessoa trocar o @). */
  idExterno: string | null;
}

/** Contas conectadas no time (só as redes que o app usa). */
export async function contasDoTime(bundle: Bundlesocial, teamId: string): Promise<ContaSocial[]> {
  const time = await bundle.team.teamGetTeam({ id: teamId });
  return (time.socialAccounts ?? [])
    .filter((c) => !c.deletedAt && (REDES as readonly string[]).includes(c.type))
    .map((c) => ({
      rede: c.type as Rede,
      usuario: c.username ?? null,
      nome: c.displayName ?? null,
      avatar: c.avatarUrl ?? null,
      idExterno: c.externalId ?? null,
    }));
}

/** Link do portal do bundle.social para conectar as redes (OAuth hospedado). */
export async function linkDeConexao(
  bundle: Bundlesocial,
  o: { teamId: string; voltarPara: string; nome?: string; avatar?: string | null; redes?: Rede[] },
): Promise<string> {
  const r = await bundle.socialAccount.socialAccountCreatePortalLink({
    requestBody: {
      teamId: o.teamId,
      redirectUrl: o.voltarPara,
      socialAccountTypes: o.redes?.length ? o.redes : [...REDES],
      language: "pt",
      expiresIn: 60,
      withBusinessScope: true,
      userName: o.nome?.slice(0, 60),
      ...(o.avatar?.startsWith("https://") ? { userLogoUrl: o.avatar } : {}),
      goBackButtonText: "Voltar para o NIDO Studio",
      hidePoweredBy: true,
    },
  });
  return r.url;
}

/** Monta o `data` de cada rede. Conteúdo sintético é sempre sinalizado (exigência das redes e da NIDO). */
export function dadosPorRede(o: {
  redes: Rede[];
  texto: string;
  titulo?: string;
  uploadId: string | null;
  midiaTipo: TipoMidia | null;
}): Record<string, unknown> {
  const uploads = o.uploadId ? [o.uploadId] : undefined;
  const video = o.midiaTipo === "video";
  const d: Record<string, unknown> = {};
  for (const r of o.redes) {
    if (r === "INSTAGRAM")
      d.INSTAGRAM = {
        type: video ? "REEL" : "POST",
        text: o.texto,
        uploadIds: uploads,
        shareToFeed: true,
        isAiGenerated: true,
      };
    if (r === "TIKTOK")
      d.TIKTOK = {
        type: video ? "VIDEO" : "IMAGE",
        text: o.texto,
        uploadIds: uploads,
        privacy: "PUBLIC_TO_EVERYONE",
        isAiGenerated: true,
      };
    if (r === "YOUTUBE")
      d.YOUTUBE = {
        type: "SHORT",
        text: (o.titulo ?? "").slice(0, 100),
        description: o.texto,
        uploadIds: uploads,
        privacy: "PUBLIC",
        madeForKids: false,
        containsSyntheticMedia: true,
      };
    if (r === "TWITTER") d.TWITTER = { text: o.texto, uploadIds: uploads, isAiGenerated: true };
    if (r === "LINKEDIN") d.LINKEDIN = { text: o.texto, uploadIds: uploads, privacy: "PUBLIC" };
  }
  return d;
}

/** Envia a mídia (URL pré-assinada do S3) e cria o post agendado. Devolve o id do post no bundle.social. */
export async function criarPost(
  bundle: Bundlesocial,
  o: {
    teamId: string;
    redes: Rede[];
    texto: string;
    titulo?: string;
    midiaUrl: string | null;
    midiaTipo: TipoMidia | null;
    quando: Date;
    referencia: string;
  },
): Promise<string> {
  const upload = o.midiaUrl
    ? await bundle.upload.uploadCreateFromUrl({ requestBody: { teamId: o.teamId, url: o.midiaUrl } })
    : null;
  const post = await bundle.post.postCreate({
    requestBody: {
      teamId: o.teamId,
      title: (o.titulo || o.texto || "Post").slice(0, 100),
      referenceKey: o.referencia,
      // Sempre em UTC. Data agora (ou passada) = publica imediatamente.
      postDate: o.quando.toISOString(),
      status: "SCHEDULED",
      socialAccountTypes: o.redes,
      data: dadosPorRede({ ...o, uploadId: upload?.id ?? null }) as never,
    },
  });
  return post.id;
}

export interface EstadoPost {
  status: string;
  erros: Partial<Record<Rede, string>> | null;
  links: Partial<Record<Rede, string>> | null;
}

/** Situação do post no bundle.social (status, erros e links publicados por rede). */
export async function estadoPost(bundle: Bundlesocial, postId: string): Promise<EstadoPost> {
  const p = await bundle.post.postGet({ id: postId });
  const erros: Partial<Record<Rede, string>> = {};
  const links: Partial<Record<Rede, string>> = {};
  for (const r of REDES) {
    const verboso = (
      p.errorsVerbose as Record<string, { userFacingMessage?: string | null } | null> | null
    )?.[r];
    const erro = verboso?.userFacingMessage || (p.errors as Record<string, string | null> | null)?.[r];
    if (erro) erros[r] = erro;
    const link = (p.externalData as Record<string, { permalink?: string | null } | null> | null)?.[r]
      ?.permalink;
    if (link) links[r] = link;
  }
  return {
    status: p.status,
    erros: Object.keys(erros).length ? erros : null,
    links: Object.keys(links).length ? links : null,
  };
}

/** Nomes das redes para mensagens. */
export function nomesRedes(redes: Rede[]): string {
  return redes.map((r) => INFO_REDES[r].nome).join(", ");
}

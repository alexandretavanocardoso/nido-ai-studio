-- Vídeos por link (TikTok/Instagram/YouTube Shorts/arquivo direto).
-- O arquivo de origem NÃO é guardado: fica só a URL temporária no storage do
-- fal (de onde a IA lê) por até 24h, pra não buscar de novo na hora de gerar.
create table if not exists links_video (
  id          text primary key,
  user_id     text not null references "user" ("id") on delete cascade,
  url         text not null,          -- link colado
  plataforma  text not null,          -- tiktok | instagram | youtube | direto
  fal_url     text not null,          -- cópia temporária para a IA
  duracao     real not null,
  largura     integer,
  altura      integer,
  titulo      text,
  autor       text,
  thumb       text,
  created_at  timestamptz not null default now()
);
create index if not exists links_video_user_idx on links_video (user_id, created_at desc);

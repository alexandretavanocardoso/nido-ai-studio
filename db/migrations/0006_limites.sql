-- Gerações simultâneas e cota de armazenamento por plano.

-- Vagas de geração em andamento (imagem, legenda, envio de vídeo). Cada uma
-- expira sozinha, caso a função caia antes de liberar. Jobs de vídeo em
-- processamento são contados direto de video_jobs.
create table if not exists geracoes_ativas (
  id         text primary key,
  user_id    text not null references "user" ("id") on delete cascade,
  tipo       text not null,                 -- imagem | video
  expira_em  timestamptz not null
);
create index if not exists geracoes_ativas_user_idx on geracoes_ativas (user_id, tipo);

-- Uso de armazenamento (bytes no S3), recalculado periodicamente pela listagem
-- do bucket e somado a cada envio no meio do caminho.
alter table creditos_conta add column if not exists armazenamento_bytes bigint not null default 0;
alter table creditos_conta add column if not exists armazenamento_em timestamptz;

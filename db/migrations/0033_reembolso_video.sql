-- Pedido de reembolso dos créditos de um vídeo gerado (lib/video/reembolso-server.ts).
-- A pessoa pede, com o motivo; o admin aprova (os créditos do job voltam) ou
-- recusa, com a explicação. Um pedido por vídeo.
create table if not exists reembolsos_video (
  id             text primary key,
  user_id        text not null references "user" ("id") on delete cascade,
  job_id         text not null references video_jobs ("id") on delete cascade,
  motivo         text not null,                    -- defeito | pessoa_errada | outro
  detalhe        text,                             -- o que a pessoa escreveu (obrigatório em "outro")
  creditos       integer not null,                 -- quanto o vídeo custou (o que volta se aprovar)
  status         text not null default 'pendente', -- pendente | aprovado | recusado
  resposta       text,                             -- por que foi recusado (aparece para a pessoa)
  resolvido_por  text,                             -- e-mail do admin
  created_at     timestamptz not null default now(),
  resolvido_em   timestamptz
);
create unique index if not exists reembolsos_video_job_idx on reembolsos_video (job_id);
create index if not exists reembolsos_video_status_idx on reembolsos_video (status, created_at desc);
create index if not exists reembolsos_video_user_idx on reembolsos_video (user_id);

-- Primeira vez que a pessoa baixou o vídeo pelo app (/api/storage/file?baixar=).
-- O admin vê isso ao julgar o pedido de reembolso.
alter table video_jobs add column if not exists baixado_em timestamptz;
create index if not exists video_jobs_result_key_idx on video_jobs (result_key) where result_key is not null;

-- Jobs de troca de pessoa em vídeo (fal.ai). O vídeo de entrada e o
-- resultado ficam no S3; aqui fica só o acompanhamento do processamento.

create table if not exists video_jobs (
  id              text primary key,
  user_id         text not null references "user" ("id") on delete cascade,
  character_id    text not null,
  status          text not null default 'na_fila', -- na_fila | processando | finalizando | concluido | erro
  modelo          text not null,
  fal_request_id  text not null,
  input           jsonb not null,
  duracao         real,
  result_key      text,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists video_jobs_user_id_idx on video_jobs (user_id, created_at desc);

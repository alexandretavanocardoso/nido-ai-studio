-- Radar do dia: pautas (notícias e X) por personagem, um por dia (horário de Brasília).
create table if not exists radares (
  id           text primary key,
  user_id      text not null references "user" ("id") on delete cascade,
  character_id text not null,
  dia          date not null,
  status       text not null default 'ok',      -- ok | sem_creditos | erro
  resumo       text,
  itens        jsonb not null default '[]',
  temas        jsonb not null default '[]',
  com_x        boolean not null default false,
  custo        jsonb,                           -- tokens, buscas e US$ (conferência)
  visto_em     timestamptz,
  created_at   timestamptz not null default now(),
  unique (character_id, dia)
);
create index if not exists radares_user_idx on radares (user_id, dia desc);

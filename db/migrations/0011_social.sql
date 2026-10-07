-- Publicação nas redes (bundle.social). Cada influencer tem o seu "time" no
-- bundle.social (com as contas sociais dele); os posts ficam espelhados aqui.
create table if not exists social_times (
  user_id       text not null references "user" ("id") on delete cascade,
  character_id  text not null,
  team_id       text not null unique,
  created_at    timestamptz not null default now(),
  primary key (user_id, character_id)
);

create table if not exists posts_agendados (
  id              text primary key,
  user_id         text not null references "user" ("id") on delete cascade,
  character_id    text not null,
  bundle_post_id  text unique,
  redes           text[] not null,
  texto           text not null default '',
  titulo          text,
  midia_key       text,
  midia_tipo      text,                       -- video | imagem
  post_date       timestamptz not null,
  status          text not null default 'SCHEDULED', -- espelha o bundle.social
  erros           jsonb,
  links           jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists posts_agendados_char_idx on posts_agendados (user_id, character_id, post_date desc);

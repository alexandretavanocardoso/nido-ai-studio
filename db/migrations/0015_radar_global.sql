-- Radar global: um radar por nicho, idioma e dia, compartilhado por todos os usuários
-- (quem paga a pesquisa é a plataforma, uma vez só).
create table if not exists radares_globais (
  id         text primary key,
  nicho      text not null,
  idioma     text not null default 'pt',
  dia        date not null,
  resumo     text,
  itens      jsonb not null default '[]',
  com_x      boolean not null default false,
  custo      jsonb,
  created_at timestamptz not null default now(),
  unique (nicho, idioma, dia)
);
create index if not exists radares_globais_dia_idx on radares_globais (idioma, dia desc);

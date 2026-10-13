-- Notícias para o admin (lib/noticias/server.ts): dois agentes leem o X e a web
-- todo dia — um acompanha os concorrentes, o outro as IAs que o NIDO usa.
-- Uma linha por notícia.
create table if not exists noticias_admin (
  id            text primary key,
  agente        text not null,                  -- concorrentes | ias
  alvo          text not null,                  -- id do alvo em lib/noticias/tipos.ts (higgsfield, chatgpt…)
  chave         text not null,                  -- o link (ou o título, sem link): é o que impede repetir a notícia
  titulo        text not null,
  resumo        text not null default '',       -- o que aconteceu
  impacto       text not null default '',       -- o que isso muda para o NIDO
  fonte         text not null default 'noticia',-- x | site | noticia
  url           text,
  publicado_em  text,                           -- ISO, como a fonte mostra (às vezes só o dia)
  nota          integer not null default 5,     -- 1 a 10
  created_at    timestamptz not null default now()
);
create unique index if not exists noticias_admin_chave_idx on noticias_admin (agente, chave);
create index if not exists noticias_admin_lista_idx on noticias_admin (agente, created_at desc);

-- Uma linha por rodada de um agente: quando rodou, o que achou e quanto custou.
create table if not exists noticias_admin_buscas (
  id          text primary key,
  agente      text not null,
  achados     integer not null default 0,
  novos       integer not null default 0,
  custo_usd   numeric(10, 4) not null default 0, -- só a parte do Claude; o Grok (X) fica no log
  usou_x      boolean not null default false,
  erro        text,
  created_at  timestamptz not null default now()
);
create index if not exists noticias_admin_buscas_idx on noticias_admin_buscas (agente, created_at desc);

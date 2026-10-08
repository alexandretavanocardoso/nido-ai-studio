-- Métricas dos posts publicados (Dashboard), por post e por rede. São a última
-- leitura do analytics do bundle.social; `atualizado_em` evita consultar de novo
-- a cada abertura da tela.
create table if not exists posts_metricas (
  post_id        text not null references posts_agendados (id) on delete cascade,
  rede           text not null,
  views          bigint not null default 0,
  curtidas       bigint not null default 0,
  comentarios    bigint not null default 0,
  reposts        bigint not null default 0,
  quotes         bigint not null default 0,
  salvos         bigint not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (post_id, rede)
);

-- Sorteio de gift (lib/sorteio): o admin cria um sorteio com um plano de
-- presente (sem renovação), as contas entram com um nome e um influencer, e
-- uma corrida de influencers no ginásio mostra o ganhador. O servidor sorteia
-- antes da corrida (que só encena o resultado) e entrega o presente quando
-- ela termina. Um ganhador por sorteio.
create table if not exists sorteios (
  id            text primary key,
  titulo        text not null,
  plano         text not null,                  -- starter | creator | studio
  meses         integer not null default 1,     -- tempo do plano de presente
  status        text not null default 'aberto', -- aberto | fechado | correndo | concluido | cancelado
  criado_por    text not null,                  -- e-mail do admin
  criado_em     timestamptz not null default now(),
  largada_em    timestamptz,                    -- quando a corrida começa (com a contagem)
  semente       bigint,                         -- receita da corrida (a mesma em todas as telas)
  ordem         jsonb,                          -- ids dos corredores, na ordem da corrida
  vencedor_id   text,                           -- participante sorteado
  entrega       jsonb,                          -- o que o ganhador recebeu (plano até X ou créditos)
  concluido_em  timestamptz
);
create index if not exists sorteios_recentes_idx on sorteios (criado_em desc);

create table if not exists sorteio_participantes (
  id            text primary key,
  sorteio_id    text not null references sorteios ("id") on delete cascade,
  user_id       text not null references "user" ("id") on delete cascade,
  nome          text not null,
  character_id  text,                           -- o influencer que corre (vazio: corredor genérico)
  foto          bytea,                          -- rosto do influencer, 256 px (público na corrida)
  removido      boolean not null default false, -- tirado pelo admin (não corre)
  criado_em     timestamptz not null default now()
);
create unique index if not exists sorteio_participantes_conta_idx on sorteio_participantes (sorteio_id, user_id);
create index if not exists sorteio_participantes_sorteio_idx on sorteio_participantes (sorteio_id, criado_em);

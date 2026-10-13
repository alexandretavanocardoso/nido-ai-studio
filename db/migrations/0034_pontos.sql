-- Sistema de pontos (lib/pontos-server.ts). Os pontos se acumulam por conta:
-- check-in diário, créditos gastos, primeiros passos, posts e indicação.
-- Todo ganho (ou perda, quando um gasto é estornado) vai para o histórico.
create table if not exists pontos_conta (
  user_id         text primary key references "user" ("id") on delete cascade,
  saldo           integer not null default 0,
  -- check-in: dias seguidos e o último dia (no horário de Brasília)
  sequencia       integer not null default 0,
  ultimo_checkin  date,
  updated_at      timestamptz not null default now()
);

create table if not exists pontos_mov (
  id          text primary key,
  user_id     text not null references "user" ("id") on delete cascade,
  delta       integer not null,   -- positivo = ganhou; negativo = gasto estornado
  motivo      text not null,      -- checkin | creditos_gastos | estorno | post | indicacao | missao
  ref         text,               -- cobrança, post, missão…
  -- o que só pode pontuar uma vez (checkin:2026-10-13, missao:primeira_imagem, post:<id>…)
  chave       text,
  created_at  timestamptz not null default now()
);
create index if not exists pontos_mov_user_idx on pontos_mov (user_id, created_at desc);
create unique index if not exists pontos_mov_chave_idx on pontos_mov (user_id, chave);
create index if not exists pontos_mov_ref_idx on pontos_mov (user_id, ref) where ref is not null;

-- Planos e créditos.
-- Saldo em dois "baldes": creditos_plano (recarrega todo mês, some quando o
-- plano expira) e creditos_avulsos (pacotes, valem 12 meses). Débitos gastam
-- primeiro o do plano. Toda movimentação vai pro histórico (creditos_mov).

create table if not exists creditos_conta (
  user_id               text primary key references "user" ("id") on delete cascade,
  plano                 text not null default 'gratis',          -- gratis | starter | creator | studio
  intervalo             text,                                    -- mensal | anual
  plano_expira_em       timestamptz,                             -- fim do período pago
  proxima_recarga_em    timestamptz,                             -- quando o plano recarrega
  creditos_plano        integer not null default 0 check (creditos_plano >= 0),
  creditos_avulsos      integer not null default 0 check (creditos_avulsos >= 0),
  avulsos_expira_em     timestamptz,
  stripe_customer_id    text,
  stripe_subscription_id text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists creditos_mov (
  id          text primary key,
  user_id     text not null references "user" ("id") on delete cascade,
  -- negativo = gasto; positivo = recarga, compra, bônus ou estorno
  delta       integer not null,
  do_plano    integer not null default 0,
  do_avulso   integer not null default 0,
  motivo      text not null,   -- ex.: imagem, video_troca, compra_pacote, recarga_plano, estorno
  ref         text,            -- id do job / pagamento relacionado
  created_at  timestamptz not null default now()
);
create index if not exists creditos_mov_user_idx on creditos_mov (user_id, created_at desc);

-- Pagamentos (Stripe e USDC). `id` = id externo, garante idempotência.
create table if not exists pagamentos (
  id           text primary key,          -- cs_... (Stripe) ou usdc_...
  user_id      text not null references "user" ("id") on delete cascade,
  provedor     text not null,             -- stripe | usdc
  tipo         text not null,             -- plano | pacote
  plano        text,
  intervalo    text,
  pacote       text,
  valor        numeric not null,
  moeda        text not null,             -- BRL | USD
  status       text not null default 'pendente', -- pendente | pago | expirado
  referencia   text,                      -- USDC: chave de referência do Solana Pay
  assinatura   text,                      -- USDC: assinatura da transação on-chain
  created_at   timestamptz not null default now(),
  pago_em      timestamptz
);
create index if not exists pagamentos_user_idx on pagamentos (user_id, created_at desc);
create unique index if not exists pagamentos_assinatura_idx on pagamentos (assinatura) where assinatura is not null;

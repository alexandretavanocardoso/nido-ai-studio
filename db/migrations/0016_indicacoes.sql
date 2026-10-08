-- Indicações (referral): quem indica ganha uma comissão em dinheiro quando o
-- indicado assina um plano. O saque é feito pelo Stripe Connect.

-- Código de indicação de cada usuário (um por conta) e a conta Stripe de saque.
create table if not exists indicacao_contas (
  user_id            text primary key references "user" ("id") on delete cascade,
  codigo             text not null unique,           -- minúsculas, 3–24: a-z 0-9 - _
  personalizado      boolean not null default false, -- o usuário já escolheu o código (só pode uma vez)
  stripe_account_id  text,                           -- conta Connect (Express) para receber os saques
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Quem indicou quem. Um usuário só pode ser indicado uma vez.
create table if not exists indicacoes (
  indicado_user_id   text primary key references "user" ("id") on delete cascade,
  indicador_user_id  text not null references "user" ("id") on delete cascade,
  codigo             text not null,                  -- código usado na hora (o do indicador pode mudar depois)
  created_at         timestamptz not null default now(),
  check (indicado_user_id <> indicador_user_id)
);
create index if not exists indicacoes_indicador_idx on indicacoes (indicador_user_id, created_at desc);

-- Saques: cada um é uma transferência do Stripe para a conta Connect do usuário.
create table if not exists indicacao_saques (
  id                  text primary key,
  user_id             text not null references "user" ("id") on delete cascade,
  moeda               text not null,                 -- BRL | USD
  valor               numeric(12,2) not null check (valor > 0),
  status              text not null default 'processando', -- processando | pago | falhou
  stripe_transfer_id  text,
  erro                text,
  created_at          timestamptz not null default now()
);
create index if not exists indicacao_saques_user_idx on indicacao_saques (user_id, created_at desc);

-- Comissões. Uma por pagamento (idempotência) e uma por indicado (só a
-- primeira assinatura conta). Fica "pendente" até `disponivel_em`.
create table if not exists indicacao_comissoes (
  id                 text primary key,
  indicador_user_id  text not null references "user" ("id") on delete cascade,
  indicado_user_id   text not null references "user" ("id") on delete cascade,
  pagamento_id       text not null unique references pagamentos (id) on delete cascade,
  plano              text,
  valor_base         numeric(12,2) not null,         -- o que o indicado pagou
  moeda              text not null,                  -- BRL | USD
  valor              numeric(12,2) not null,         -- a comissão
  status             text not null default 'disponivel', -- disponivel | sacada
  disponivel_em      timestamptz not null,
  saque_id           text references indicacao_saques (id),
  created_at         timestamptz not null default now()
);
create unique index if not exists indicacao_comissoes_indicado_idx on indicacao_comissoes (indicado_user_id);
create index if not exists indicacao_comissoes_indicador_idx on indicacao_comissoes (indicador_user_id, created_at desc);

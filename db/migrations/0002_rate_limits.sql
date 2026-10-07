-- Contadores de rate limit / cota (lib/ai/rate-limit.ts).
-- Uma linha por chave e janela fixa; linhas antigas são apagadas pelo
-- cron diário (/api/cron/storage-cleanup).

create table if not exists rate_limits (
  key           text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limits_window_start_idx on rate_limits (window_start);

-- Crie seu Influenciador Sintético — migration inicial (Postgres / Neon).
-- Rode no SQL Editor do Neon (Console → seu projeto → SQL Editor), ou com
--   psql "$DATABASE_URL" -f db/migrations/0001_init.sql
--
-- Tabelas do Better Auth (user, session, account, verification) + a tabela
-- de personagens. Não há RLS: o isolamento entre contas é feito nas rotas
-- /api/characters, que sempre filtram por user_id da sessão.

-- ── Better Auth ─────────────────────────────────────────────────────────
create table if not exists "user" (
  "id"            text primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" boolean not null default false,
  "image"         text,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create table if not exists "session" (
  "id"         text primary key,
  "expiresAt"  timestamptz not null,
  "token"      text not null unique,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now(),
  "ipAddress"  text,
  "userAgent"  text,
  "userId"     text not null references "user" ("id") on delete cascade
);
create index if not exists session_user_id_idx on "session" ("userId");

create table if not exists "account" (
  "id"                    text primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "user" ("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz not null default now(),
  "updatedAt"             timestamptz not null default now()
);
create index if not exists account_user_id_idx on "account" ("userId");

create table if not exists "verification" (
  "id"         text primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz not null default now(),
  "updatedAt"  timestamptz not null default now()
);
create index if not exists verification_identifier_idx on "verification" ("identifier");

-- ── Personagens ─────────────────────────────────────────────────────────
create table if not exists characters (
  id          text primary key,
  user_id     text not null references "user" ("id") on delete cascade,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists characters_user_id_updated_at_idx
  on characters (user_id, updated_at desc);

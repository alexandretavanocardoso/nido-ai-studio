-- Tokens de API da conta: é com eles que o Claude Code (ou outro cliente MCP)
-- se conecta em /api/mcp e age em nome do usuário. Só o hash fica guardado; o
-- token inteiro aparece uma única vez, na hora em que é criado.
create table if not exists tokens_api (
  id             text primary key,
  user_id        text not null references "user" ("id") on delete cascade,
  nome           text not null,
  -- sha256 (hex) do token inteiro
  hash           text not null unique,
  -- começo do token, para o usuário reconhecer na lista (ex.: nidoaistudio_AbC1)
  prefixo        text not null,
  created_at     timestamptz not null default now(),
  ultimo_uso_em  timestamptz,
  revogado_em    timestamptz
);
create index if not exists tokens_api_user_idx on tokens_api (user_id, created_at desc);

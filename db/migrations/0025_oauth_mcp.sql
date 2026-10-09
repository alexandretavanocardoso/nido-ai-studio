-- Login por OAuth no servidor MCP (/api/mcp): é o que o "conector personalizado"
-- do Claude (claude.ai → Conectores) usa. O Claude se registra sozinho como
-- cliente, o usuário autoriza numa tela do app e o Claude recebe um token de
-- API da conta (tabela tokens_api, a mesma dos tokens criados à mão).

-- Clientes que se registraram (registro dinâmico, RFC 7591). São públicos: não
-- têm segredo; o que protege a troca do código é o PKCE.
create table if not exists oauth_clientes (
  id             text primary key,
  nome           text not null,
  -- Endereços para onde o código de autorização pode voltar (lista de URLs).
  redirect_uris  jsonb not null,
  created_at     timestamptz not null default now()
);

-- Códigos de autorização: valem 5 minutos e uma vez só. Só o hash fica guardado.
create table if not exists oauth_codigos (
  -- sha256 (hex) do código
  hash            text primary key,
  client_id       text not null references oauth_clientes (id) on delete cascade,
  user_id         text not null references "user" ("id") on delete cascade,
  redirect_uri    text not null,
  -- desafio PKCE (S256) enviado no pedido de autorização
  code_challenge  text not null,
  expires_at      timestamptz not null,
  usado_em        timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists oauth_codigos_expira_idx on oauth_codigos (expires_at);

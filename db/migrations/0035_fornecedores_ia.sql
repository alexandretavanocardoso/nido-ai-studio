-- Radar de fornecedores de IA (lib/fornecedores/server.ts): empresas de vídeo,
-- imagem e voz que um agente acha na web, para o admin procurar no LinkedIn e
-- negociar condições melhores. Uma linha por empresa.
create table if not exists fornecedores_ia (
  id            text primary key,
  chave         text not null,                  -- domínio do site (ou o nome, sem site): é o que impede repetir a empresa
  nome          text not null,
  pais          text,
  categorias    jsonb not null default '[]',    -- ["video", "imagem", "voz"]
  oferece       text not null default '',       -- o que a empresa vende
  api           text not null default 'incerto',-- sim | nao | incerto
  preco         text,                           -- como a fonte mostra; null = não divulgado
  site          text,
  linkedin      text,                           -- página da empresa, só se apareceu na pesquisa
  pessoas       text,                           -- nomes e cargos que estavam públicos
  porque        text not null default '',       -- por que interessa ao NIDO
  nota          integer not null default 5,     -- 1 a 10
  fontes        jsonb not null default '[]',    -- [{ "titulo": "...", "url": "https://..." }]
  status        text not null default 'nova',   -- nova | interessante | contatada | negociando | descartada
  anotacoes     text,
  abordagem     jsonb,                          -- rascunho: { "idioma": "en" | "zh", "convite": "...", "mensagem": "..." }
  created_at    timestamptz not null default now(),
  visto_em      timestamptz not null default now() -- última pesquisa em que a empresa apareceu
);
create unique index if not exists fornecedores_ia_chave_idx on fornecedores_ia (chave);
create index if not exists fornecedores_ia_status_idx on fornecedores_ia (status, nota desc);

-- Uma linha por pesquisa de categoria: quando rodou, o que achou e quanto custou.
create table if not exists fornecedores_ia_buscas (
  id          text primary key,
  categoria   text not null,                    -- video | imagem | voz
  achados     integer not null default 0,
  novos       integer not null default 0,
  custo_usd   numeric(10, 4) not null default 0,
  erro        text,
  created_at  timestamptz not null default now()
);
create index if not exists fornecedores_ia_buscas_idx on fornecedores_ia_buscas (categoria, created_at desc);

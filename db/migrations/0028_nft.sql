-- NFT do influencer (Metaplex Core, na Solana) e badges de views. Ver lib/nft/.
-- O NFT é intransferível (soulbound) e os badges ficam gravados nele; o banco é
-- a fonte e a rede é o espelho público.

-- Carteira Solana vinculada à conta (uma por conta). A posse é provada com a
-- assinatura de uma mensagem; a mesma carteira não fica em duas contas.
create table if not exists carteiras (
  user_id        text primary key references "user" ("id") on delete cascade,
  endereco       text not null unique,
  verificada_em  timestamptz not null default now()
);

-- Desafio de uso único para provar a carteira (vale alguns minutos).
create table if not exists carteira_desafios (
  nonce       text primary key,
  user_id     text not null references "user" ("id") on delete cascade,
  endereco    text not null,
  mensagem    text not null,          -- texto exato que a carteira assina
  expira_em   timestamptz not null,
  usado_em    timestamptz
);
create index if not exists carteira_desafios_user_idx on carteira_desafios (user_id, expira_em desc);

-- Mint do NFT de um personagem. O endereço do asset e a assinatura da transação
-- são gravados ANTES do envio: se algo cair no meio, dá para conferir na rede.
create table if not exists nft_mints (
  id                 text primary key,
  -- sem cascade: a conta pode ser apagada e o NFT continua existindo na rede
  user_id            text references "user" ("id") on delete set null,
  character_id       text not null,
  carteira           text not null,           -- dona do NFT
  asset              text not null unique,    -- endereço do NFT
  rede               text not null,           -- devnet | mainnet
  nome               text not null,           -- nome gravado na rede
  ficha_hash         text not null,           -- SHA-256 da ficha no momento do mint
  capa_key           text,                    -- cópia da capa (não some com a limpeza do S3)
  status             text not null default 'preparando', -- preparando | enviado | confirmado | falhou
  assinatura         text unique,
  valido_ate_bloco   bigint,                  -- depois deste bloco a transação não entra mais
  cobranca           jsonb,                   -- créditos cobrados (para estornar se falhar)
  estornado          boolean not null default false,
  erro               text,
  -- badges já gravados no NFT (ids) e a trava de quem está gravando agora
  badges_onchain     text[] not null default '{}',
  badges_gravado_em  timestamptz,
  badges_trava       timestamptz,
  conferido_em       timestamptz,             -- última conferência rede × banco
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  confirmado_em      timestamptz
);
-- Um NFT por personagem: só pode existir um mint que não falhou.
create unique index if not exists nft_mints_vivo_idx on nft_mints (character_id)
  where status in ('preparando', 'enviado', 'confirmado');
create index if not exists nft_mints_status_idx on nft_mints (status, created_at);
create index if not exists nft_mints_user_idx on nft_mints (user_id, created_at desc);

-- Conta de rede social → personagem. Cada conta conta para um personagem só (o
-- primeiro que a usou); o vínculo não é desfeito ao desconectar a conta.
create table if not exists nft_contas_rede (
  rede          text not null,
  usuario       text not null,                -- @ em minúsculas, sem o @ (ou "id:<id na rede>")
  character_id  text not null,
  user_id       text not null references "user" ("id") on delete cascade,
  desde         timestamptz not null default now(),
  primary key (rede, usuario)
);
create index if not exists nft_contas_rede_char_idx on nft_contas_rede (character_id);

-- Maior leitura válida de views de cada post (nunca diminui). A chave identifica
-- o post na rede ("REDE:id"), então o mesmo post não soma duas vezes — nem pelo
-- app e pelo link, nem em dois personagens.
create table if not exists nft_views_post (
  chave          text primary key,
  character_id   text not null,
  user_id        text not null references "user" ("id") on delete cascade,
  rede           text not null,
  views          bigint not null default 0,
  atualizado_em  timestamptz not null default now()
);
create index if not exists nft_views_post_char_idx on nft_views_post (character_id);

-- Total acumulado de views do personagem (soma de nft_views_post) e quando foi conferido.
create table if not exists nft_views (
  character_id   text primary key,
  user_id        text not null references "user" ("id") on delete cascade,
  total          bigint not null default 0,
  conferido_em   timestamptz not null default now()
);

-- Badges do personagem. Nascem aqui quando a marca é batida (mesmo antes do
-- mint) e depois são gravados no NFT. Marcas altas esperam aprovação do admin.
create table if not exists nft_badges (
  character_id  text not null,
  badge         text not null,                -- id do catálogo (lib/nft/badges.ts)
  user_id       text references "user" ("id") on delete set null,
  views         bigint not null,              -- total no momento da conquista
  status        text not null default 'concedido', -- concedido | aguardando | recusado
  motivo        text,                         -- por que espera aprovação
  concedido_em  timestamptz not null default now(),
  decidido_por  text,                         -- e-mail do admin que aprovou ou recusou
  decidido_em   timestamptz,
  primary key (character_id, badge)
);
create index if not exists nft_badges_status_idx on nft_badges (status, concedido_em desc);

-- Autor do post cadastrado por link (o @ lido da rede): só conta para os badges
-- quando é uma conta conectada ao personagem.
alter table posts_agendados add column if not exists autor text;

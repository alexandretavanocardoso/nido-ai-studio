-- NFT do influencer: a arte do NFT. É o retrato do personagem redesenhado no
-- estilo da coleção (lib/nft/arte.ts), gerado antes do mint, e é ela que vira
-- a imagem pública do NFT. Uma por personagem: gerar de novo substitui.
create table if not exists nft_artes (
  character_id  text primary key,
  user_id       text not null references "user" ("id") on delete cascade,
  key           text not null,                -- arquivo no S3 (users/<id>/nft/arte-…jpg)
  criado_em     timestamptz not null default now()
);
create index if not exists nft_artes_user_idx on nft_artes (user_id);

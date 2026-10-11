-- NFT do influencer: ajustes da revisão de 10/10.
-- Ver lib/nft/mint.ts e lib/nft/views-server.ts.

-- Um NFT vivo por personagem EM CADA REDE. O que foi mintado em devnet (testes)
-- não impede o mint do mesmo personagem na mainnet, e cada instância do app só
-- mexe nos mints da rede em que está (NFT_REDE).
create unique index if not exists nft_mints_vivo_rede_idx on nft_mints (character_id, rede)
  where status in ('preparando', 'enviado', 'confirmado');
drop index if exists nft_mints_vivo_idx;

-- Leitura do autor dos posts cadastrados por link: quantas vezes o app já
-- tentou e quando foi a última. Cada tentativa é uma execução no Apify; depois
-- da terceira o post fica como "autor não informado" (autor = '') e só volta a
-- ser lido pelo Dashboard.
alter table posts_agendados
  add column if not exists autor_tentativas smallint not null default 0,
  add column if not exists autor_tentado_em timestamptz;

-- NFT do influencer: conta do influencer pelo primeiro link, e badges para
-- todas as métricas (views, curtidas, comentários, reposts, quotes e salvos).
-- Ver lib/nft/views-server.ts e lib/nft/badges.ts.

-- Como a conta de rede ficou ligada ao personagem:
--   conectada = login na rede pelo bundle.social (prova forte);
--   link      = autor do primeiro post cadastrado por link naquela rede.
alter table nft_contas_rede add column if not exists origem text not null default 'conectada';

-- A tabela guardava só as views de cada post. Passa a guardar a maior leitura
-- de cada métrica, e se o post é de conta conectada (os badges mais altos só
-- saem sozinhos com números de conta conectada).
alter table nft_views_post
  add column if not exists curtidas    bigint  not null default 0,
  add column if not exists comentarios bigint  not null default 0,
  add column if not exists reposts     bigint  not null default 0,
  add column if not exists quotes      bigint  not null default 0,
  add column if not exists salvos      bigint  not null default 0,
  add column if not exists verificada  boolean not null default false;

-- Totais do personagem por métrica ({"views": 1200, "curtidas": 80, …}), os
-- mesmos totais contando só contas conectadas, o resumo do que ficou de fora
-- (para a tela explicar) e quando os autores dos posts por link foram lidos.
-- `total` continua sendo o total de views.
alter table nft_views
  add column if not exists totais      jsonb not null default '{}',
  add column if not exists verificados jsonb not null default '{}',
  add column if not exists resumo      jsonb,
  add column if not exists autores_em  timestamptz;

-- Métrica do badge. A coluna `views` de nft_badges passa a guardar o total
-- DESSA métrica no momento da conquista (o nome ficou do tempo em que só havia
-- badges de views).
alter table nft_badges add column if not exists metrica text not null default 'views';

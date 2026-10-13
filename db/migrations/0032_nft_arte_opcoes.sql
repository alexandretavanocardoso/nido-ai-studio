-- NFT do influencer: a arte passa a ser escolhida entre cinco. Cada geração
-- produz cinco opções (opcoes); a pessoa escolhe uma (key) e minta com ela.
-- Depois do mint a imagem do NFT não muda mais.
alter table nft_artes add column if not exists opcoes text[] not null default '{}';
alter table nft_artes alter column key drop not null;
-- Arte gerada no formato antigo (uma só): vira a única opção, já escolhida.
update nft_artes set opcoes = array[key] where key is not null and opcoes = '{}';

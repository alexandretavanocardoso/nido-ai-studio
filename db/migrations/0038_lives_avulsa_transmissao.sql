-- Live sem personagem e transmissão direta para as redes (lib/live).
-- Live sem personagem: a pessoa envia uma foto e escreve quem é e como fala;
-- fica em `persona` ({nome, descricao}) e `character_id` fica vazio.
alter table lives alter column character_id drop not null;
alter table lives add column if not exists persona jsonb;
-- Transmissão pelo LiveKit (egress RTMP): os ids no LiveKit e as redes
-- ({egress: [{id, redes, vertical}], inicio}). As chaves de transmissão NÃO
-- ficam aqui: vão só para o LiveKit.
alter table lives add column if not exists transmissao jsonb;

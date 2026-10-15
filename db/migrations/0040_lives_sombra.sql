-- Shadow ao vivo (lib/live): a webcam de quem faz a live vira o influencer em
-- tempo real (Decart Lucy 2.5), sem avatar do Runway. `tipo` separa as duas
-- lives; na sombra a voz pode ser a da própria pessoa (voice_id vazio).
alter table lives add column if not exists tipo text not null default 'avatar'; -- avatar | sombra
alter table lives alter column voice_id drop not null;

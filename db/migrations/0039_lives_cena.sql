-- Cenário da live (lib/live/cena.ts): onde o avatar aparece. Descrito em texto
-- ({prompt}) ou por uma imagem enviada ({imageKey}); a foto da pessoa é posta
-- nesse lugar (Nano Banana) antes de virar o avatar. Vazio: o fundo da foto.
alter table lives add column if not exists cena jsonb;

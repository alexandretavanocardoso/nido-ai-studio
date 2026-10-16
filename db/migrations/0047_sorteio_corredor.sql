-- Sorteio: o corredor é o próprio influencer. Ao entrar, o Nano Banana desenha
-- o influencer da pessoa correndo (de corpo inteiro, de lado) e o fundo sai
-- (lib/sorteio/corredor.ts): é essa figura que corre. `trocas` conta as trocas
-- de influencer (cada uma desenha de novo).
alter table sorteio_participantes add column if not exists corpo bytea;
alter table sorteio_participantes add column if not exists trocas integer not null default 0;

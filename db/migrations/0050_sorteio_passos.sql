-- Sorteio: as pernas do corredor se mexendo — tira com as 4 poses do ciclo de
-- corrida (WebP transparente, lib/sorteio/passos.ts). Vazia = a figura parada.
alter table sorteio_participantes add column if not exists passos bytea;

-- Sorteio: quanto a corrida dura (o ganhador cruza a linha nesse instante),
-- escolhido pelo admin entre 15 e 30 s. Os sorteios antigos ficam com 24 s,
-- a duração fixa de antes.
alter table sorteios add column if not exists duracao_s int not null default 24;
alter table sorteios drop constraint if exists sorteios_duracao_s_check;
alter table sorteios add constraint sorteios_duracao_s_check check (duracao_s between 10 and 60);

-- Sorteio: além do plano, o prêmio pode ser créditos (caem na conta), pontos
-- (caem na conta) ou Pix (o ganhador informa a chave e o admin paga à mão).
-- `quantidade`: créditos, pontos ou centavos do Pix. Plano e meses só valem
-- para o prêmio "plano".
alter table sorteios add column if not exists premio text not null default 'plano'; -- plano | creditos | pontos | pix
alter table sorteios add column if not exists quantidade integer;
alter table sorteios alter column plano drop not null;
alter table sorteios alter column meses drop not null;

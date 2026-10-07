-- Compra manual de créditos (quantidade livre, mínimo 100): tipo = 'avulso'
-- e a quantidade comprada fica em `creditos`.
alter table pagamentos add column if not exists creditos integer;

-- Indicações: a comissão deixa de ser só da primeira assinatura e passa a valer
-- em cada assinatura paga pelo indicado, por até 12 meses. Sai a trava de
-- "uma comissão por indicado" (continua valendo "uma por pagamento").
drop index if exists indicacao_comissoes_indicado_idx;
create index if not exists indicacao_comissoes_indicado_idx on indicacao_comissoes (indicado_user_id, created_at);

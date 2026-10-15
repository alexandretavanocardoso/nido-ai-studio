-- Saques de indicação (auditoria de 15/10/2026).
-- tx_nonce: saque em USDC nas redes EVM — a vez (nonce) da carteira de saques
--   usada pela transação. Sem ela não dá para saber se uma transferência sem
--   registro ainda pode entrar na rede; devolver o saldo cedo demais pagaria
--   o saque duas vezes.
-- cobrada_no_saque (em indicacao_comissoes): dívida de estorno descontada por
--   um saque. Presa a ele na mesma instrução, para dois saques não descontarem
--   a mesma dívida; volta a ser dívida se o saque não sair.
-- valor_pago / moeda_paga / cambio: saque em dólar pago pelo Stripe sai em
--   reais (a conta do Stripe só tem saldo em reais), pela cotação do dia.
alter table indicacao_saques add column if not exists tx_nonce   bigint;
alter table indicacao_saques add column if not exists valor_pago numeric(12,2);
alter table indicacao_saques add column if not exists moeda_paga text;
alter table indicacao_saques add column if not exists cambio     numeric(12,6);
alter table indicacao_comissoes add column if not exists cobrada_no_saque text;

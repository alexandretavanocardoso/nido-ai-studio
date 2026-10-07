-- USDC em redes EVM (Ethereum, Base, Arbitrum, BNB Chain), além da Solana.
-- rede: solana | ethereum | base | arbitrum | bnb (nulo = solana, pagamentos antigos)
-- bloco_verificado: até onde a busca de logs já foi (continua de lá na próxima consulta)
alter table pagamentos add column if not exists rede text;
alter table pagamentos add column if not exists bloco_verificado bigint;
create index if not exists pagamentos_usdc_pendente_idx on pagamentos (rede, valor) where provedor = 'usdc' and status = 'pendente';
-- pagador: carteira que enviou o USDC (EVM), para conferência e suporte
alter table pagamentos add column if not exists pagador text;

-- Indicações: saque em USDC on-chain (carteira de saques da NIDO → carteira do
-- usuário). Comissão de plano pago em USDC fica na moeda 'USDC' e é sacada
-- assim; BRL e USD continuam saindo pelo Stripe.
alter table indicacao_saques add column if not exists rede     text; -- solana | base | arbitrum | bnb | ethereum (null = Stripe)
alter table indicacao_saques add column if not exists carteira text; -- endereço de destino do usuário
alter table indicacao_saques add column if not exists tx_hash  text; -- hash (EVM) ou assinatura (Solana) da transferência

-- Indicações: a comissão em USDC fica na rede em que o indicado pagou e só
-- pode ser sacada nessa mesma rede (o USDC que entrou na Base sai pela Base).
alter table indicacao_comissoes add column if not exists rede text; -- solana | base | arbitrum | bnb | ethereum (null = BRL/USD, Stripe)
-- Comissões que já existem: a rede do pagamento (nulo = solana, pagamentos antigos).
update indicacao_comissoes c
set rede = coalesce(p.rede, 'solana')
from pagamentos p
where p.id = c.pagamento_id and c.moeda = 'USDC' and c.rede is null;

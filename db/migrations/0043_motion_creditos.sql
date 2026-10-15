-- Motion cobra créditos (lib/motion-creditos.ts): a estimativa é reservada ao
-- pedir e acertada pelo custo real quando o worker termina.
-- cobranca: a reserva (a Cobranca de lib/creditos.ts), para devolver ou completar.
-- acertado_em: quando o acerto foi feito (uma vez só por motion).
alter table motions add column if not exists cobranca jsonb;
alter table motions add column if not exists acertado_em timestamptz;
create index if not exists motions_acerto_idx on motions (updated_at)
  where cobranca is not null and acertado_em is null;

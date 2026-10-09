-- Recursos em teste (lib/em-teste.ts): quem pode usar cada um — só admin, ou
-- todas as contas. O admin liga e desliga na área admin (aba "Em teste"), sem
-- precisar de deploy. Sem linha para um recurso, vale o padrão do código.
create table if not exists recursos_em_teste (
  recurso         text primary key,
  -- true = só as contas admin veem e usam; false = liberado para todos
  so_admin        boolean not null,
  atualizado_em   timestamptz not null default now(),
  -- e-mail do admin que mudou por último
  atualizado_por  text
);

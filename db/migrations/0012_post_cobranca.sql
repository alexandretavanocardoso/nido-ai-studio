-- Cobrança do post (créditos), pra devolver se o agendamento for cancelado
-- (o post volta para o backlog e pode ser editado e agendado de novo).
alter table posts_agendados add column if not exists cobranca jsonb;

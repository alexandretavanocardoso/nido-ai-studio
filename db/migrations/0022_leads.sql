-- Contatos vindos da landing page: inscrição na whitelist e pedido de proposta
-- do plano Agência. Não exigem conta. Um e-mail entra uma vez por tipo.

create table if not exists leads (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('whitelist', 'agencia')),
  nome        text not null,
  email       text not null,
  whatsapp    text,
  perfil      text,          -- whitelist: marca | agencia | creator
  nicho       text,          -- whitelist
  empresa     text,          -- agência
  creators    text,          -- agência: quantos creators quer operar
  objetivo    text,          -- agência
  created_at  timestamptz not null default now()
);
create unique index if not exists leads_tipo_email_idx on leads (tipo, lower(email));

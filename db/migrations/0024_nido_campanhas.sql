-- Dashboard → "Por campanha": de qual personagem (influencer de IA) é cada
-- campanha do Nido em que o usuário participou. O app tenta ligar sozinho pelo
-- link do post; esta tabela guarda a escolha feita à mão, que vale por cima
-- (quem enviou o post direto no Nido, sem registrar aqui, só tem esta).
create table if not exists nido_campanha_personagem (
  user_id       text not null references "user" ("id") on delete cascade,
  -- id da campanha no Nido (clássica ou de clipes)
  campanha_id   text not null,
  character_id  text not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, campanha_id)
);

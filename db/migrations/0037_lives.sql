-- Live do personagem (lib/live): o avatar do Runway em tempo real numa sala do
-- LiveKit, falando as respostas ao chat com a voz do personagem (ElevenLabs).
-- Uma linha por live. Cada vez que o avatar entra na sala é uma sessão do
-- Runway (a primeira e as reconexões), guardada em `sessoes`.
create table if not exists lives (
  id            text primary key,
  user_id       text not null references "user" ("id") on delete cascade,
  character_id  text not null,
  status        text not null default 'preparando', -- preparando | pronta | no_ar | encerrada | erro
  image_key     text not null,                      -- imagem de onde saiu o avatar
  voice_id      text not null,                      -- voz da ElevenLabs
  avatar_id     text,                               -- avatar do Runway
  duracao_min   integer not null,                   -- minutos cobrados ao entrar no ar
  sala          text not null,                      -- sala do LiveKit
  sessoes       jsonb not null default '[]'::jsonb, -- [{id, inicio, fim?, segundos?}] em ms
  cobranca      jsonb,                              -- cobrança da duração (lib/creditos)
  segundos      integer,                            -- tempo no ar, ao encerrar
  creditos      integer,                            -- o que ficou cobrado, ao encerrar
  erro          text,
  -- Chats lidos pelo servidor (lib/live/chat.ts): {youtube: {...}, kick: {...}}
  chat          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  iniciada_em   timestamptz,
  encerrada_em  timestamptz
);
create index if not exists lives_user_idx on lives (user_id, created_at desc);
create index if not exists lives_no_ar_idx on lives (iniciada_em) where status = 'no_ar';
create index if not exists lives_kick_idx on lives ((chat->'kick'->>'broadcasterId')) where status = 'no_ar';

-- Mensagens do chat do YouTube e do Kick que chegaram durante a live. A página
-- do operador lê as novas (id maior que o último que ela viu) e põe na fila.
create table if not exists live_chat (
  id          bigserial primary key,
  live_id     text not null references lives ("id") on delete cascade,
  origem      text not null,       -- youtube | kick
  ext_id      text not null,       -- id da mensagem no serviço (evita repetir)
  autor       text not null default '',
  texto       text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists live_chat_ext_idx on live_chat (live_id, origem, ext_id);
create index if not exists live_chat_live_idx on live_chat (live_id, id);

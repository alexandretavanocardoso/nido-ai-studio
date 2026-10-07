-- Persona treinada (LoRA), vozes (ElevenLabs) e declarações de consentimento.

-- Declarações obrigatórias (treino de persona e clonagem de voz): registro
-- de quem declarou, o quê e quando — pra auditoria.
create table if not exists consentimentos (
  id            text primary key,
  user_id       text not null references "user" ("id") on delete cascade,
  character_id  text not null,
  tipo          text not null,      -- treino_persona | clone_voz
  texto         text not null,      -- texto exato que a pessoa marcou
  ip            text,
  created_at    timestamptz not null default now()
);
create index if not exists consentimentos_user_idx on consentimentos (user_id, created_at desc);

-- Modelos treinados por personagem. id = id do job (video_jobs).
-- A geração busca daqui (não confia no navegador).
create table if not exists personas_treino (
  id            text primary key,
  user_id       text not null references "user" ("id") on delete cascade,
  character_id  text not null,
  alvo          text not null,      -- flux (imagem) | wan (vídeo)
  status        text not null default 'treinando', -- treinando | pronto | erro
  gatilho       text not null,      -- palavra-gatilho do personagem no prompt
  key           text,               -- arquivo do LoRA no S3
  key_alta      text,               -- Wan 2.2: LoRA do especialista "high noise"
  imagens       integer not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists personas_treino_char_idx on personas_treino (user_id, character_id, alvo, created_at desc);

-- Vozes criadas na ElevenLabs (a conta da ElevenLabs é da NIDO; aqui fica o dono).
create table if not exists vozes (
  voice_id      text primary key,
  user_id       text not null references "user" ("id") on delete cascade,
  character_id  text not null,
  nome          text not null,
  origem        text not null,      -- design | clone
  descricao     text,
  amostra_key   text,               -- prévia/amostra no S3
  created_at    timestamptz not null default now()
);
create index if not exists vozes_char_idx on vozes (user_id, character_id, created_at desc);

-- Sombra 3D (lib/live/avatar3d.ts): o influencer vira um avatar 3D estilo
-- desenho/jogo, mexido pela webcam no navegador (rastreio do rosto, sem IA por
-- minuto). Cada avatar sai de uma foto (do personagem ou avulsa): o Nano Banana
-- faz a versão desenho e o fal (Trellis 2) faz o modelo 3D. A mesma foto
-- reaproveita o avatar em outras lives.
create table if not exists avatares_3d (
  id              text primary key,
  user_id         text not null references "user" ("id") on delete cascade,
  image_key       text not null,                   -- foto de onde saiu
  status          text not null default 'gerando', -- gerando | pronto | erro
  estilizada_key  text,                            -- a versão desenho que virou 3D
  fal_request_id  text,                            -- pedido do modelo 3D no fal
  modelo_key      text,                            -- o .glb pronto, no S3
  cobranca        jsonb,                           -- devolvida se falhar
  erro            text,
  created_at      timestamptz not null default now(),
  pronto_em       timestamptz
);
create index if not exists avatares_3d_foto_idx on avatares_3d (user_id, image_key, created_at desc);

-- A live da Sombra 3D aponta para o avatar que ela usa.
alter table lives add column if not exists avatar3d_id text;

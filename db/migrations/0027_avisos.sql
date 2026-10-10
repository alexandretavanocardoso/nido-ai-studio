-- Avisos do sino da barra (lib/avisos-server.ts): o que terminou ou falhou
-- (vídeo, imagem, figurinha…). Ficam na conta, para aparecer em qualquer
-- aparelho — inclusive o que terminou com o app fechado.
create table if not exists avisos (
  id         text primary key,
  user_id    text not null references "user" ("id") on delete cascade,
  -- o que terminou (nome do vídeo, "Gerando imagem"…); a tela põe o
  -- "Terminou:" / "Não deu certo:" no idioma de quem lê
  rotulo     text not null,
  erro       boolean not null default false,
  -- onde ver o resultado (caminho dentro do app)
  href       text,
  -- identifica o acontecimento (ex.: video:<job>), para o servidor e os
  -- aparelhos abertos não registrarem o mesmo aviso mais de uma vez
  chave      text,
  lida       boolean not null default false,
  criado_em  timestamptz not null default now()
);

create index if not exists avisos_user_idx on avisos (user_id, criado_em desc);
create unique index if not exists avisos_chave_idx on avisos (user_id, chave);

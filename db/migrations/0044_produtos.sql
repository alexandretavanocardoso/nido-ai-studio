-- Produtos criados na aba "Criar produto" da tela /app/produto: a IA cria o
-- produto em 3D com a logo da empresa (nas cores dela ou mantendo as do
-- produto), a partir de uma foto básica ou de uma descrição. Ficam salvos
-- para usar no vídeo de produto.
-- image_key: o produto criado · logo_key / foto_key: o que a pessoa enviou.
-- cores: "logo" (o produto ganha as cores da logo) ou "produto" (mantém as
-- cores dele e só recebe a logo).
-- modelo: o id da escolha (lib/produto-criado.ts), ex.: "nano-banana:pro".
create table if not exists produtos (
  id text primary key,
  user_id text not null references "user"("id") on delete cascade,
  nome text not null,
  descricao text not null default '',
  image_key text not null,
  logo_key text not null,
  foto_key text,
  prompt text,
  cores text not null default 'logo',
  modelo text not null,
  created_at timestamptz not null default now()
);
create index if not exists produtos_user_idx on produtos (user_id, created_at desc);

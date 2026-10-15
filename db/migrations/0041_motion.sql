-- Motion (tela /app/motion, só admin): um modelo de IA escreve uma animação
-- em HTML (motion graphics) de um site, de um produto ou de um influencer. O
-- processo worker/motion pega cada pedido daqui: lê o site, gera o HTML e,
-- quando pedido, grava o vídeo (MP4) quadro a quadro num Chrome.
create table if not exists motions (
  id text primary key,
  user_id text not null references "user"("id") on delete cascade,
  -- Geração do HTML: na_fila → gerando → pronto | erro.
  status text not null default 'na_fila',
  tipo text not null, -- site | produto | influencer | misto
  modelo text not null,
  esforco text,
  -- O pedido: texto, formato, duração, imagens (assets), site, produto,
  -- influencer e, num ajuste, o pedido de mudança e o HTML de base.
  input jsonb not null,
  html_key text,
  -- O vídeo: null (não pedido) → na_fila → renderizando → pronto | erro.
  render text,
  video_key text,
  render_erro text,
  -- Andamento mostrado na tela (etapa, caracteres escritos, quadros gravados).
  progresso jsonb,
  -- Tokens e custo em dólar da geração.
  uso jsonb,
  error text,
  -- Sinal de vida de quem pegou o trabalho: parado há 10 min, outro retoma.
  vivo_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists motions_user_idx on motions (user_id, created_at desc);
create index if not exists motions_fila_idx on motions (created_at)
  where status in ('na_fila', 'gerando') or render in ('na_fila', 'renderizando');

-- Sinal de vida do worker/motion (também parado, esperando trabalho): a tela
-- avisa quando ele não está ligado.
create table if not exists motion_worker (
  id text primary key,
  vivo_em timestamptz not null default now()
);

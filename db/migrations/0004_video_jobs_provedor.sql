-- Jobs de vídeo passam a ter mais de um serviço (fal.ai e Runway) e tipo.
alter table video_jobs add column if not exists provedor text not null default 'fal'; -- fal | runway
alter table video_jobs add column if not exists tipo text not null default 'substituir'; -- substituir | criar

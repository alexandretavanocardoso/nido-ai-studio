-- Post publicado por fora (o usuário baixou a mídia e postou à mão): entra pelo
-- link, já como POSTED, sem post no bundle.social. O link fica em `links` e as
-- métricas (lidas do link público) em posts_metricas.
alter table posts_agendados add column if not exists manual boolean not null default false;

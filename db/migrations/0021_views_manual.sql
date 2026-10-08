-- Views digitadas pelo usuário num post por link (ex.: impressões do LinkedIn,
-- que só o autor vê). Quando preenchido, vale no lugar do `views` lido da rede
-- e não é sobrescrito pelas releituras.
alter table posts_metricas add column if not exists views_manual bigint;

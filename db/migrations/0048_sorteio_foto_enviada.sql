-- Sorteio: quem não tem influencer (ou prefere) envia uma foto, que vira o
-- corredor como o influencer viraria (desenhada correndo). `imagem_key` é a
-- foto enviada, no S3; vazia quando corre um influencer ou o boneco.
alter table sorteio_participantes add column if not exists imagem_key text;

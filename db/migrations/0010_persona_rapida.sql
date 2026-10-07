-- Persona: treinador rápido (alvo 'flux1', FLUX.1 LoRA Fast) além do Pro
-- ('flux', FLUX.2). O treino de vídeo (Wan) saiu. `gratis` marca o treino
-- incluso no plano (Studio: 1 por mês).
alter table personas_treino add column if not exists gratis boolean not null default false;

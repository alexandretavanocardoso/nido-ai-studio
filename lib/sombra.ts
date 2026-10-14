/**
 * Sombra sem personagem (tela /app/sombra): troca a pessoa de uma foto ou de
 * um vídeo pela imagem que a pessoa envia, sem criar um personagem. Usa as
 * mesmas rotas da Sombra do Estúdio (/api/imagens/trocar e
 * /api/videos/substituir), só que sem `characterId`. Compartilhado entre a
 * tela e o servidor.
 */

/**
 * `character_id` dos jobs de vídeo (e das declarações de uso) feitos sem
 * personagem: a coluna não aceita vazio, e nenhum personagem tem este id.
 */
export const SOMBRA_SEM_PERSONAGEM = "sombra";

/**
 * Onde ficam as fotos geradas sem personagem. A limpeza de órfãos não apaga
 * esta pasta enquanto a conta existir (lib/storage/cleanup.ts); os vídeos
 * ficam guardados pelo job (video_jobs.result_key).
 */
export const pastaSombra = (userId: string) => `users/${userId}/sombra/`;

/**
 * A foto original de cada troca fica na mesma pasta, com o nome do resultado
 * mais este final (abc.jpg → abc-antes.jpg): é o "antes" do antes e depois.
 */
export const SUFIXO_ANTES = "-antes.jpg";

/** Quantos itens de cada tipo o histórico da tela mostra. */
export const HISTORICO_SOMBRA = 30;

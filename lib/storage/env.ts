/** Pastas por tipo de arquivo, e o que cada uma aceita. */
export const STORAGE_KINDS = {
  refs: { maxBytes: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] },
  videos: { maxBytes: 500 * 1024 * 1024, types: ["video/mp4", "video/quicktime", "video/webm"] },
  /** Lives gravadas para a Sombra de vídeo (o processo da Sombra apaga depois de usar). */
  lives: { maxBytes: 5 * 1024 * 1024 * 1024, types: ["video/mp4", "video/quicktime", "video/webm"] },
  /** Amostras de voz para clonar (ElevenLabs aceita até ~10 MB por arquivo). */
  audios: {
    maxBytes: 10 * 1024 * 1024,
    types: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg"],
  },
} as const;

export type StorageKind = keyof typeof STORAGE_KINDS;

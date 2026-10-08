"use client";

import type { Character, ReferenciaImagem } from "@/lib/types";
import type { StorageKind } from "./env";
import { txErro } from "@/lib/i18n/erros";

/** URL same-origin que redireciona pro arquivo no S3 (ver /api/storage/file). */
export function fileUrl(key: string): string {
  return `/api/storage/file/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Imagem de capa do personagem: a escolhida em "Usar como capa"; senão o retrato
 * gerado mais recente (é a melhor foto de perfil); senão a 1ª referência.
 */
export function capaSrc(c: Character): string | undefined {
  if (c.visual.capaKey) return fileUrl(c.visual.capaKey);
  const retrato = (c.geradas ?? [])
    .filter((g) => g.tipo === "retrato")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (retrato) return fileUrl(retrato.key);
  return refSrc(c.visual.referencias[0]);
}

/** Link que baixa o arquivo (com esse nome) em vez de abrir na aba. */
export function downloadUrl(key: string, nome: string): string {
  return `${fileUrl(key)}?baixar=${encodeURIComponent(nome)}`;
}

/** src exibível de uma referência: base64 local (modo anônimo) ou arquivo no S3. */
export function refSrc(r: Pick<ReferenciaImagem, "dataUrl" | "key"> | undefined): string | undefined {
  if (!r) return undefined;
  return r.dataUrl || (r.key ? fileUrl(r.key) : undefined);
}

/**
 * Envia um arquivo direto ao S3 por URL pré-assinada e devolve a key.
 * `onProgress` recebe 0–1 (útil pra vídeos grandes).
 */
export async function uploadFile(
  file: Blob,
  kind: StorageKind,
  onProgress?: (p: number) => void,
): Promise<string> {
  const res = await fetch("/api/storage/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !body.key || !body.url)
    throw new Error(txErro(body.error ?? `Falha ao preparar envio (HTTP ${res.status}).`));

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", body.url!);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(txErro(`O S3 recusou o envio (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error(txErro("Falha de rede ao enviar o arquivo (confira o CORS do bucket).")));
    xhr.send(file);
  });
  return body.key;
}

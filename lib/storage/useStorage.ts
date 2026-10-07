"use client";

import { nanoid } from "nanoid";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import type { ReferenciaImagem } from "@/lib/types";
import { STORAGE_KINDS } from "./env";
import { uploadFile } from "./client";

/** true quando os arquivos vão pro S3: armazenamento ligado + conta logada. */
export function useStorageReady(): boolean {
  const { user } = useAuth();
  const { armazenamento } = useRecursos();
  return armazenamento && !!user;
}

const MAX_LOCAL = 4 * 1024 * 1024;

/** Limite por imagem de referência no modo atual (S3 aceita mais). */
export function maxRefBytes(usarS3: boolean): number {
  return usarS3 ? STORAGE_KINDS.refs.maxBytes : MAX_LOCAL;
}

/**
 * Cria a referência a partir de um arquivo: envia ao S3 (guarda só a key)
 * ou, no modo anônimo, lê como base64 (fica no IndexedDB, como antes).
 */
export async function criarReferencia(file: File, usarS3: boolean): Promise<ReferenciaImagem> {
  if (usarS3) {
    const key = await uploadFile(file, "refs");
    return { id: nanoid(8), name: file.name, dataUrl: "", size: file.size, key };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  return { id: nanoid(8), name: file.name, dataUrl, size: file.size };
}

"use client";

import { useEffect, useRef } from "react";
import { useCharacters } from "@/lib/store";
import { deleteImageData } from "@/lib/image-db";
import { shrinkDataUrl } from "@/lib/image-resize";
import { uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { useStorageReady } from "@/lib/storage/useStorage";
import type { Character } from "@/lib/types";

/**
 * Migra pro S3, em segundo plano e uma por vez, as imagens de referência
 * que ainda estão em base64 (criadas no modo anônimo ou antes do S3).
 * Depois de enviada, a referência guarda só a key e o base64 sai do
 * IndexedDB e do JSON sincronizado com o banco.
 */
export function StorageMigrator() {
  const pronto = useStorageReady();
  const characters = useCharacters((s) => s.characters);
  const rodando = useRef(false);
  const falharam = useRef(new Set<string>());

  useEffect(() => {
    if (!pronto || rodando.current) return;
    const pendente = proximaPendente(characters, falharam.current);
    if (!pendente) return;

    rodando.current = true;
    const { charId, refId, dataUrl } = pendente;
    void (async () => {
      try {
        let blob = await (await fetch(dataUrl)).blob();
        if (
          !(STORAGE_KINDS.refs.types as readonly string[]).includes(blob.type)
        ) {
          // GIF, BMP etc.: converte pra JPEG antes de enviar.
          blob = await (
            await fetch(await shrinkDataUrl(dataUrl, 2048, 0.9))
          ).blob();
        }
        const key = await uploadFile(blob, "refs");
        useCharacters.getState().update(charId, (c) => {
          const marcar = (refs: Character["visual"]["referencias"]) => {
            for (const r of refs)
              if (r.id === refId && !r.key)
                Object.assign(r, { key, dataUrl: "" });
          };
          marcar(c.visual.referencias);
          // Snapshots do Desfazer apontam pra mesma imagem: sem isso, desfazer a
          // perderia (o base64 sai do IndexedDB logo abaixo).
          for (const h of c._history) marcar(h.snapshot.visual.referencias);
        });
        await deleteImageData(refId);
      } catch (e) {
        console.warn(
          `[storage] não deu pra migrar a referência ${refId}:`,
          (e as Error).message,
        );
        falharam.current.add(refId);
      } finally {
        rodando.current = false;
        // Dispara a próxima mesmo se o update não mudou nada (falha).
        useCharacters.setState((s) => ({ characters: [...s.characters] }));
      }
    })();
  }, [pronto, characters]);

  return null;
}

function proximaPendente(characters: Character[], pular: Set<string>) {
  for (const c of characters) {
    for (const r of c.visual.referencias) {
      if (!r.key && r.dataUrl?.startsWith("data:") && !pular.has(r.id)) {
        return { charId: c.id, refId: r.id, dataUrl: r.dataUrl };
      }
    }
  }
  return null;
}

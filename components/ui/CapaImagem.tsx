"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Imagem de capa num quadro de tamanho fixo (quem define o tamanho é o pai).
 *  - Retrato (mais alta que larga): preenche o quadro, ancorada no topo — o
 *    rosto nunca é cortado.
 *  - Card largo (folha de referência): aparece inteira sobre um fundo
 *    desfocado dela mesma, sem faixas cinzas.
 *  - `inteira`: sempre a imagem toda (sem corte), sobre o fundo desfocado —
 *    para fotos de cena, onde cortar perde o que importa.
 */
export function CapaImagem({
  src,
  alt,
  zoomNoHover,
  inteira,
}: {
  src: string;
  alt: string;
  zoomNoHover?: boolean;
  inteira?: boolean;
}) {
  const [largoMedido, setLargo] = useState(false);
  const largo = inteira || largoMedido;
  return (
    <>
      {largo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover scale-110 blur-2xl opacity-40"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) =>
          setLargo(
            e.currentTarget.naturalWidth > e.currentTarget.naturalHeight * 1.05,
          )
        }
        className={cn(
          "absolute inset-0 h-full w-full transition duration-500",
          largo ? "object-contain" : "object-cover object-[50%_8%]",
          zoomNoHover && "group-hover:scale-105",
        )}
      />
    </>
  );
}

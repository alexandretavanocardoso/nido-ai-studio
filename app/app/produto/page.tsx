"use client";

import { EmTeste } from "@/components/EmTeste";
import { VideoProduto } from "@/components/produto/VideoProduto";

/** Vídeo de produto (em teste: só admin). */
export default function ProdutoPage() {
  return (
    <EmTeste recurso="video_produto">
      <VideoProduto />
    </EmTeste>
  );
}

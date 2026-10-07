"use client";

/**
 * Reduz uma imagem (dataUrl) para no máximo `maxSide` px no lado maior e
 * reencoda em JPEG. Usado antes de mandar referências pro servidor, pra
 * caber no limite de 4,5 MB por request da Vercel.
 */
export async function shrinkDataUrl(dataUrl: string, maxSide = 1024, quality = 0.85): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#fff"; // PNG com transparência vira fundo branco no JPEG
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

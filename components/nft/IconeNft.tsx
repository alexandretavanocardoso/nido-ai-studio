import { createLucideIcon } from "lucide-react";

/**
 * Ícone do NFT do influencer: um perfil dentro de um hexágono — a moldura com
 * que redes e carteiras mostram o avatar que é um NFT. Feito no traço dos
 * outros ícones do app (lucide), então entra em abas e botões como qualquer um.
 */
export const IconeNft = createLucideIcon("NftDoInfluencer", [
  [
    "path",
    {
      d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
      key: "moldura",
    },
  ],
  ["circle", { cx: "12", cy: "9.5", r: "2.75", key: "cabeca" }],
  ["path", { d: "M7.5 17.5a4.5 4.5 0 0 1 9 0", key: "ombros" }],
]);

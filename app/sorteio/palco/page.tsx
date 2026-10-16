import { PalcoSorteio } from "@/components/sorteio/PalcoSorteio";

export const metadata = { title: "Sorteio", robots: { index: false } };

/** Palco do sorteio: a corrida em tela cheia, para a fonte de navegador do OBS (o sorteio vem no link). */
export default function PalcoSorteioPage() {
  return <PalcoSorteio />;
}

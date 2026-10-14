import { Palco } from "@/components/live/Palco";

export const metadata = { title: "Live", robots: { index: false } };

/** Palco da live: fonte de navegador do OBS (o acesso vem no link). */
export default function PalcoPage() {
  return <Palco />;
}

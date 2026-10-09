import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Link de indicação (/?ref=codigo): ao ser compartilhado (WhatsApp, X,
 * LinkedIn…), a prévia mostra a imagem do programa de indicação em vez do
 * banner padrão do site (que vem do layout).
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}): Promise<Metadata> {
  if (!(await searchParams).ref) return {};
  const imagem = {
    url: "/banner/afiliados-hero.jpg",
    width: 1600,
    height: 603,
    alt: "NIDO AI Studio",
  };
  return {
    openGraph: { images: [imagem] },
    twitter: { card: "summary_large_image", images: [imagem.url] },
  };
}

export default function Page() {
  return <LandingPage />;
}

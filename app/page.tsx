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
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <LandingPage />
    </>
  );
}

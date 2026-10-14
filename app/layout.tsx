import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { CharactersSyncer } from "@/components/auth/CharactersSyncer";
import { CapturarIndicacao } from "@/components/indicacao/CapturarIndicacao";
import { StorageMigrator } from "@/components/auth/StorageMigrator";
import { RecursosProvider } from "@/components/RecursosProvider";
import { ConfirmacaoHost } from "@/components/ui/Confirmacao";
import { CreditosProvider } from "@/components/creditos/CreditosProvider";
import { recursosDisponiveis } from "@/lib/recursos";
import { ComIdioma, IdiomaDoDocumento } from "@/lib/i18n";
import { cambioUsdBrl } from "@/lib/moeda";
import { ComMoeda } from "@/lib/moeda-client";

const TITULO = "NIDO AI Studio — Create your AI Influencer";
const DESCRICAO =
  "Define who your AI influencer is and produce images, videos, captions and scheduled posts in the Studio — all in one place.";
/** Imagem que aparece ao compartilhar o link (WhatsApp, X, LinkedIn…). JPEG de 1905×825. */
const BANNER = { url: "/banner/banner.jpg", width: 1905, height: 825 };

export const metadata: Metadata = {
  // Os apps de mensagem só mostram a imagem com endereço completo: este é o domínio do site.
  metadataBase: new URL(
    process.env.BETTER_AUTH_URL?.trim() || "https://aistudio.nido.global",
  ),
  title: TITULO,
  description: DESCRICAO,
  openGraph: {
    type: "website",
    siteName: "NIDO AI Studio",
    title: TITULO,
    description: DESCRICAO,
    images: [{ ...BANNER, alt: "NIDO AI Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO,
    images: [BANNER.url],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <RecursosProvider recursos={recursosDisponiveis()}>
          <AuthProvider>
            <CreditosProvider>
              <CharactersSyncer />
              <CapturarIndicacao />
              <StorageMigrator />
              <ComMoeda cambio={cambioUsdBrl()}>
                <ComIdioma>
                  {children}
                  <ConfirmacaoHost />
                </ComIdioma>
              </ComMoeda>
              <IdiomaDoDocumento />
            </CreditosProvider>
          </AuthProvider>
        </RecursosProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { CharactersSyncer } from "@/components/auth/CharactersSyncer";
import { StorageMigrator } from "@/components/auth/StorageMigrator";
import { RecursosProvider } from "@/components/RecursosProvider";
import { ConfirmacaoHost } from "@/components/ui/Confirmacao";
import { CreditosProvider } from "@/components/creditos/CreditosProvider";
import { recursosDisponiveis } from "@/lib/recursos";
import { ComIdioma, IdiomaDoDocumento } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "NIDO AI Studio — Crie seu Influenciador Sintético",
  description:
    "Defina quem é o seu influenciador sintético e produza imagens, vídeos, legendas e posts agendados no Estúdio — tudo em um só lugar.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <RecursosProvider recursos={recursosDisponiveis()}>
          <AuthProvider>
            <CreditosProvider>
              <CharactersSyncer />
              <StorageMigrator />
              <ComIdioma>
                {children}
                <ConfirmacaoHost />
              </ComIdioma>
              <IdiomaDoDocumento />
            </CreditosProvider>
          </AuthProvider>
        </RecursosProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";
import { PrivacidadeEn } from "./en";
import { PrivacidadePt } from "./pt";

export const metadata: Metadata = {
  title: "Política de Privacidade (Privacy Policy) · NIDO Studio",
  description:
    "Quais dados o NIDO Studio coleta, para que usa, com quem compartilha e como você pode pedir acesso ou exclusão.",
};

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      versoes={{
        pt: {
          titulo: "Política de Privacidade",
          atualizadoEm: "7 de outubro de 2026",
          corpo: <PrivacidadePt />,
        },
        en: {
          titulo: "Privacy Policy",
          atualizadoEm: "October 7, 2026",
          corpo: <PrivacidadeEn />,
        },
      }}
    />
  );
}

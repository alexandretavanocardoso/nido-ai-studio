import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/PaginaLegal";
import { TermosEn } from "./en";
import { TermosPt } from "./pt";

export const metadata: Metadata = {
  title: "Termos de Serviço (Terms of Service) · NIDO Studio",
  description:
    "Regras de uso do NIDO Studio: conta, conteúdo, uso aceitável, planos, créditos e pagamentos.",
};

export default function TermosPage() {
  return (
    <PaginaLegal
      versoes={{
        pt: {
          titulo: "Termos de Serviço",
          atualizadoEm: "7 de outubro de 2026",
          corpo: <TermosPt />,
        },
        en: {
          titulo: "Terms of Service",
          atualizadoEm: "October 7, 2026",
          corpo: <TermosEn />,
        },
      }}
    />
  );
}

import { AppShell } from "@/components/AppShell";

/** Todas as telas do app (/app/*) usam a mesma barra do topo. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

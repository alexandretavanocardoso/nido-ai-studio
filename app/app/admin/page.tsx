import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminApp } from "@/components/admin/AdminApp";
import { adminAtual } from "@/lib/admin/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · NIDO AI Studio",
  robots: { index: false, follow: false },
};

/** Área admin: só para os e-mails de lib/admin/acesso.ts. Para os demais a página "não existe". */
export default async function AdminPage() {
  const admin = await adminAtual();
  if (!admin) notFound();
  return (
    <Suspense fallback={null}>
      <AdminApp email={admin.email} />
    </Suspense>
  );
}

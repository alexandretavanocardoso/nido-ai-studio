import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Motion } from "@/components/motion/Motion";
import { adminAtual } from "@/lib/admin/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Motion",
  robots: { index: false, follow: false },
};

/** Motion (só admin: ainda não cobra créditos). */
export default async function MotionPage() {
  if (!(await adminAtual())) notFound();
  return <Motion />;
}

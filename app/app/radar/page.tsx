import { Suspense } from "react";
import { RadarGlobal } from "@/components/radar/RadarGlobal";

export const metadata = { title: "Global radar" };

/** Radar global: o que está em alta hoje, por nicho (igual para todos os usuários). */
export default function RadarGlobalPage() {
  return (
    <Suspense fallback={null}>
      <RadarGlobal />
    </Suspense>
  );
}

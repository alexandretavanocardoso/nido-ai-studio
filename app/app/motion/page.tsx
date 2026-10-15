"use client";

import { EmTeste } from "@/components/EmTeste";
import { Motion } from "@/components/motion/Motion";

/** Motion (em teste: só admin até ser liberado na área admin, aba "Em teste"). */
export default function MotionPage() {
  return (
    <EmTeste recurso="motion">
      <Motion />
    </EmTeste>
  );
}

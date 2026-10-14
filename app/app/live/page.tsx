"use client";

import { Suspense } from "react";
import { EmTeste } from "@/components/EmTeste";
import { Live } from "@/components/live/Live";

/** Live do personagem (em teste: só admin). */
export default function LivePage() {
  return (
    <EmTeste recurso="live">
      <Suspense fallback={null}>
        <Live />
      </Suspense>
    </EmTeste>
  );
}

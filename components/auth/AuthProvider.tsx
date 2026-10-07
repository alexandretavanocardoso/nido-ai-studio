"use client";

import { createContext, useContext, useMemo } from "react";
import { authClient } from "@/lib/auth/client";
import { useRecursos } from "@/components/RecursosProvider";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface AuthState {
  /** `null` até terminar a leitura inicial. Depois: AuthUser ou undefined (anônimo). */
  user: AuthUser | null | undefined;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Login não configurado neste deploy. */
  disabled: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { login } = useRecursos();
  if (!login) return <>{children}</>;
  return <EnabledAuthProvider>{children}</EnabledAuthProvider>;
}

function EnabledAuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const user: AuthUser | null | undefined = isPending
    ? null
    : (data?.user ?? undefined);

  const value = useMemo<AuthState>(
    () => ({
      user,
      disabled: false,
      signInWithGoogle: async () => {
        await authClient.signIn.social({
          provider: "google",
          callbackURL: "/app",
          errorCallbackURL: "/auth/login",
        });
      },
      signOut: async () => {
        await authClient.signOut();
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fora do Provider (ou com auth desligado): estado "desligado".
    return {
      user: undefined,
      disabled: true,
      signInWithGoogle: async () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}

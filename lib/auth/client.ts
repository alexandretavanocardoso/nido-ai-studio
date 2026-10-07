"use client";

import { createAuthClient } from "better-auth/react";

/** Cliente do Better Auth (mesma origem do app, rotas em /api/auth/*). */
export const authClient = createAuthClient();

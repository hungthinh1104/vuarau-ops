"use client";

import type { ReactNode } from "react";
import { ApiProvider } from "@/api/providers.tsx";
import { SessionGate } from "@/api/session-gate.tsx";
import { ServiceWorkerRegistration } from "@/offline/service-worker-registration.tsx";

import { Toaster } from "@/ui/primitives/toaster.tsx";

/**
 * Every production route sits behind this, and nothing else does.
 *
 * `/` and `/demo` stay outside on purpose: the first is a static page and the
 * second renders fixtures. A gate around them would demand a token to read a
 * page that talks to nothing.
 *
 * `AuthProvider` wraps `ApiProvider` rather than the other way round: the tRPC
 * client reads the current access token on every request, and that token is
 * whatever Supabase last handed the auth provider.
 *
 * Below here there is always a verified identity, an explicitly chosen depot and
 * a permission set, which is why `useSession()` throws rather than returning null.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ApiProvider>
      <ServiceWorkerRegistration />
      <SessionGate>{children}</SessionGate>
      <Toaster />
    </ApiProvider>
  );
}

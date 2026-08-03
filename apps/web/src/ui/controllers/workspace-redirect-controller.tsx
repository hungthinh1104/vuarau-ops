"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/api/session-gate.tsx";
import { WorkspaceRedirectView } from "@/ui/screens/workspace-redirect-view.tsx";

export function WorkspaceRedirectController() {
  useSession();
  const router = useRouter();

  useEffect(() => router.replace("/customers"), [router]);

  return <WorkspaceRedirectView />;
}

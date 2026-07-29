"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../api/session-gate.tsx";
import { Skeleton } from "../../../ui/primitives/skeleton.tsx";

export default function SelectWorkspacePage() {
  useSession();
  const router = useRouter();
  useEffect(() => router.replace("/today"), [router]);
  return <Skeleton width="w-64" height="h-6" label="Đang mở vựa" />;
}

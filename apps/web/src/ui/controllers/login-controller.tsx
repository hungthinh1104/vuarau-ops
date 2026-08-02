"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/api/auth.tsx";
import { LoginView } from "@/ui/screens/login-view.tsx";

export function LoginController() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "signed_in") router.replace("/select-workspace");
  }, [auth.status, router]);

  return <LoginView status={auth.status} signIn={auth.signIn} />;
}

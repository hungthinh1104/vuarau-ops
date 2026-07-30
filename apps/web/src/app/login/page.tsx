"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/api/auth.tsx";
import { SignIn, SignInUnconfigured } from "@/ui/patterns/auth/sign-in.tsx";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "signed_in") router.replace("/select-workspace");
  }, [auth.status, router]);

  if (auth.status === "checking" || auth.status === "signed_in") {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Skeleton width="w-64" height="h-6" label="Đang mở phiên đăng nhập" />
      </main>
    );
  }
  if (auth.status === "unconfigured") return <SignInUnconfigured />;
  return <SignIn signIn={auth.signIn} />;
}

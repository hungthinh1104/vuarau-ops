"use client";

import { SignIn, SignInUnconfigured } from "@/ui/patterns/auth/sign-in.tsx";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";

type LoginStatus = "checking" | "unconfigured" | "signed_out" | "signed_in";

export type LoginViewProps = {
  readonly status: LoginStatus;
  readonly signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

export function LoginView({ status, signIn }: LoginViewProps) {
  if (status === "checking" || status === "signed_in") {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-canvas">
        <main className="relative w-full max-w-[440px] z-10 flex flex-col items-center gap-4">
          <Skeleton width="w-12" height="h-12" label="Đang tải..." />
          <Skeleton width="w-48" height="h-6" label="Đang mở phiên đăng nhập" />
        </main>
      </div>
    );
  }
  if (status === "unconfigured") return <SignInUnconfigured />;
  return <SignIn signIn={signIn} />;
}

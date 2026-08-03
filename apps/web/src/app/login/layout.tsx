import type { ReactNode } from "react";
import { AuthProvider } from "@/api/auth.tsx";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

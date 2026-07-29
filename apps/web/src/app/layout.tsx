import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "../api/auth.tsx";

export const metadata: Metadata = {
  title: "Vựa Rau — sổ vựa",
  description: "Hệ thống vận hành cho vựa rau đầu mối.",
};

/**
 * `lang="vi"` is not decoration: it selects Vietnamese hyphenation, tells a screen
 * reader which voice to use, and stops a browser offering to translate a page that
 * is already in the reader's language.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

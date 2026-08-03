import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@/ui/primitives/toaster.tsx";
import "./globals.css";
import { AuthProvider } from "@/api/auth.tsx";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  variable: "--font-be-vietnam-pro",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Vựa Rau — sổ vựa",
  description: "Hệ thống vận hành cho vựa rau đầu mối.",
  icons: {
    icon: "/icon/cauliflower-svgrepo-com.svg",
    shortcut: "/icon/cauliflower-svgrepo-com.svg",
    apple: "/icon/cauliflower-svgrepo-com.svg",
  },
};

/**
 * `lang="vi"` is not decoration: it selects Vietnamese hyphenation, tells a screen
 * reader which voice to use, and stops a browser offering to translate a page that
 * is already in the reader's language.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}

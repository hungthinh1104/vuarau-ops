"use client";

import { useEffect } from "react";
import { useAuth } from "@/api/auth.tsx";
import { useRouter } from "next/navigation";
import { Hero } from "./components/hero.tsx";
import { ProblemMarquee } from "./components/problem-marquee.tsx";
import { Workflows } from "./components/workflows.tsx";
import { ProductShowcase } from "./components/product-showcase.tsx";
import { Trust } from "./components/trust.tsx";
import { ThemeToggle } from "@/ui/components/theme-toggle.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

export function LandingPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "signed_in") {
      router.replace("/customers");
    }
  }, [auth.status, router]);

  if (auth.status === "checking") return null;

  return (
    <div className="bg-canvas text-ink selection:bg-primary/20">
      {/* FLOATING NAV */}
      <header className="fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 lg:left-6 lg:right-6 z-50 mx-auto max-w-[1600px] pointer-events-none">
        <nav className="pointer-events-auto h-14 sm:h-16 w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 rounded-[18px] sm:rounded-2xl border border-border bg-surface/70 backdrop-blur-2xl backdrop-saturate-150 shadow-sm ring-1 ring-ink/5">
          <div className="flex items-center gap-2 sm:gap-3 pl-1">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl sm:rounded-[14px] bg-primary/10 dark:bg-primary/20 border border-primary/20 p-1.5 shadow-sm">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="font-bold tracking-tight text-ink text-base sm:text-lg">Vựa Rau</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <LinkButton
              href="/login"
              tone="secondary"
              className="rounded-xl px-3 sm:px-4 h-9 sm:h-10 bg-surface/50 border-border shadow-sm ring-1 ring-ink/5 hover:bg-surface text-[12px] sm:text-[13px] font-semibold"
            >
              Đăng nhập
            </LinkButton>
            <LinkButton
              href="/demo"
              className="rounded-xl px-3 sm:px-4 h-9 sm:h-10 shadow-sm ring-1 ring-ink/5 text-[12px] sm:text-[13px] font-semibold"
            >
              Thử Demo
            </LinkButton>
          </div>
        </nav>
      </header>

      {/* SECTIONS */}
      <Hero />
      <ProblemMarquee />
      <Workflows />
      <ProductShowcase />
      <Trust />

      {/* FINAL CTA */}
      <section className="relative py-32 px-4 overflow-hidden bg-surface/50 border-t border-border">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-500 mb-6">
            Sẵn sàng chưa?
          </p>
          <h2 className="font-bold text-ink text-4xl lg:text-5xl leading-tight tracking-tight">
            Bắt đầu sổ vựa số.
          </h2>
          <p className="mt-4 mb-10 text-ink-muted lg:text-lg max-w-md">
            Dữ liệu an toàn, thao tác nhanh nhẹn, giảm thiểu rủi ro vận hành.
          </p>
          <LinkButton
            href="/login"
            className="px-10 py-4 text-base font-bold shadow-lg shadow-primary/20 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/30"
          >
            Vào hệ thống ngay
          </LinkButton>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-canvas border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface border border-border p-1">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-sm font-semibold text-ink-muted">Vựa Rau</span>
          </div>
          <p className="text-sm text-ink-muted/60">© 2026 Vựa Rau. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

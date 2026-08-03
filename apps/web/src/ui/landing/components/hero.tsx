"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, SplitText, useGSAP } from "../motion/gsap.ts";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

export function Hero() {
  const containerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subcopyRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          noReduceMotion: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions!;

          if (reduceMotion) {
            gsap.set(
              [
                headlineRef.current,
                subcopyRef.current,
                ctaRef.current,
                phoneRef.current,
                ".float-card",
              ],
              { autoAlpha: 1, y: 0, scale: 1, rotation: 0 },
            );
            return;
          }

          // --- ENTRANCE TIMELINE ---
          const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

          // 1. Headline SplitText reveal
          let splitHeadline: SplitText | null = null;
          if (headlineRef.current) {
            splitHeadline = SplitText.create(headlineRef.current, {
              type: "lines,words",
              mask: "lines",
            });
            gsap.set(splitHeadline.words, { yPercent: 110 });
            tl.to(splitHeadline.words, { yPercent: 0, duration: 1, stagger: 0.04 }, 0.1);
          }

          // 2. Subcopy fade
          tl.fromTo(
            subcopyRef.current,
            { autoAlpha: 0, y: 30 },
            { autoAlpha: 1, y: 0, duration: 1 },
            0.3,
          );

          // 3. CTA pop
          tl.fromTo(
            ctaRef.current,
            { autoAlpha: 0, scale: 0.9 },
            { autoAlpha: 1, scale: 1, duration: 0.8, ease: "back.out(1.7)" },
            0.45,
          );

          // 4. Phone Mockup
          tl.fromTo(
            phoneRef.current,
            { y: 120, rotation: 6, scale: 0.85, autoAlpha: 0 },
            { y: 0, rotation: 0, scale: 1, autoAlpha: 1, duration: 1.4 },
            0.2,
          );

          // 5. Floating Cards — staggered entrance
          tl.fromTo(
            ".float-card",
            { y: 60, autoAlpha: 0, scale: 0.85 },
            {
              y: 0,
              autoAlpha: 1,
              scale: 1,
              duration: 1.2,
              stagger: { each: 0.15, from: "random" },
            },
            0.5,
          );

          // 6. Floating Cards — continuous subtle float (CSS-like but GSAP for control)
          gsap.utils.toArray<HTMLElement>(".float-card").forEach((card, i) => {
            gsap.to(card, {
              y: i % 2 === 0 ? -8 : 8,
              duration: 2.5 + i * 0.3,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              delay: i * 0.4,
            });
          });

          // --- SCROLL PARALLAX ---
          const scrollTl = gsap.timeline({
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          });

          scrollTl
            .to(headlineRef.current, { y: -100, autoAlpha: 0, duration: 1 }, 0)
            .to(subcopyRef.current, { y: -60, autoAlpha: 0, duration: 1 }, 0)
            .to(ctaRef.current, { y: -40, autoAlpha: 0, duration: 1 }, 0)
            .to(phoneRef.current, { scale: 1.15, y: -50, duration: 1 }, 0)
            .to(".float-card", { y: (i: number) => -80 - i * 30, autoAlpha: 0, duration: 1 }, 0);

          return () => {
            if (splitHeadline) splitHeadline.revert();
          };
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <section
      ref={containerRef}
      className="relative min-h-[100dvh] w-full overflow-hidden bg-canvas pt-32 pb-20"
    >
      {/* Aurora Gradient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] -left-[15%] w-[70%] h-[70%] rounded-full bg-emerald-200/30 blur-[140px] animate-pulse" />
        <div className="absolute top-[15%] -right-[15%] w-[55%] h-[55%] rounded-full bg-lime-300/25 blur-[120px] animate-pulse [animation-delay:1s]" />
        <div className="absolute -bottom-[15%] left-[15%] w-[75%] h-[60%] rounded-full bg-sky-100/30 blur-[160px] animate-pulse [animation-delay:2s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        {/* TEXT */}
        <div className="flex flex-col items-center text-center">
          <h1
            ref={headlineRef}
            className="text-display font-bold leading-[1.08] tracking-[-0.03em] text-ink text-5xl md:text-7xl lg:text-[84px]"
          >
            Vận hành vựa rau
            <br />
            không cần nhớ mọi thứ.
          </h1>
          <p
            ref={subcopyRef}
            className="mt-8 max-w-xl text-ink-muted text-lg lg:text-xl leading-relaxed invisible"
          >
            Ghi đơn nhanh, đối soát công nợ minh bạch, không bao giờ mất dấu dữ liệu.
          </p>
          <div ref={ctaRef} className="mt-10 flex flex-col sm:flex-row gap-4 invisible">
            <LinkButton
              href="/login"
              className="px-8 py-4 text-body font-semibold shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl"
            >
              Bắt đầu ngay
            </LinkButton>
            <LinkButton
              href="/demo"
              tone="secondary"
              className="px-8 py-4 text-body font-semibold border-border bg-surface/60 backdrop-blur-md shadow-sm hover:bg-surface transition-all"
            >
              Khám phá UI
            </LinkButton>
          </div>
        </div>

        {/* Phone + Floating Cards */}
        <div className="relative mt-20 lg:mt-28 flex justify-center">
          <div
            ref={phoneRef}
            className="relative z-10 h-[580px] w-[280px] lg:h-[680px] lg:w-[330px] rounded-[48px] border-[6px] border-zinc-900 bg-zinc-900 shadow-2xl invisible ring-1 ring-white/10"
          >
            <Image
              src="/images/2.jpg"
              alt="Giao diện ghi đơn nhanh của Vựa Rau"
              fill
              className="rounded-[42px] object-cover"
              priority
            />
            {/* Dynamic Island */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-zinc-900 rounded-full" />
          </div>

          {/* Floating Cards */}
          <div className="absolute top-[15%] -left-4 z-20 lg:left-[18%] float-card invisible">
            <div className="rounded-2xl border border-border bg-surface/80 px-5 py-4 shadow-xl backdrop-blur-2xl flex items-center gap-3 ring-1 ring-ink/5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <span className="text-sm font-bold text-ink block">Đã chốt đơn</span>
                <span className="text-xs text-ink-muted">Khách Bà Năm • 12 mặt hàng</span>
              </div>
            </div>
          </div>

          <div className="absolute top-[45%] -right-4 z-20 lg:right-[18%] float-card invisible">
            <div className="rounded-2xl border border-border bg-surface/80 px-5 py-4 shadow-xl backdrop-blur-2xl flex items-center gap-3 ring-1 ring-ink/5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <div>
                <span className="text-sm font-bold text-ink block">Công nợ cần xử lý</span>
                <span className="text-xs text-ink-muted">3 khách • Tổng 12.5tr</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-[18%] -left-2 z-20 lg:left-[22%] float-card invisible">
            <div className="rounded-2xl border border-border bg-surface/80 px-5 py-4 shadow-xl backdrop-blur-2xl flex items-center gap-3 ring-1 ring-ink/5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </span>
              <div>
                <span className="text-sm font-bold text-ink block">Đã nhận hàng</span>
                <span className="text-xs text-ink-muted">420 kg • Chợ Đầu Mối</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

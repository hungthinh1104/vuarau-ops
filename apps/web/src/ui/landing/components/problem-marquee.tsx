"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "../motion/gsap.ts";

const TEXT = "GHI NHANH • CÔNG NỢ RÕ • KHÔNG MẤT ĐƠN • SỬA KHÔNG MẤT DẤU • ";

export function ProblemMarquee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          noReduceMotion: "(prefers-reduced-motion: no-preference)",
        },
        () => {
          if (!trackRef.current) return;

          // Đo chiều rộng của 1 track (chứa 2 nhóm text để seamless)
          // gsapxPercent xử lý seamless tốt nhất khi di chuyển -50% của 2 khối giống hệt nhau
          gsap.to(trackRef.current, {
            xPercent: -50,
            ease: "none",
            duration: 20,
            repeat: -1,
          });
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <section
      ref={containerRef}
      className="overflow-hidden border-y border-border bg-surface py-4 flex items-center"
    >
      {/* Chúng ta nhân đôi nội dung để tạo hiệu ứng seamless marquee */}
      <div ref={trackRef} className="flex whitespace-nowrap will-change-transform">
        <div className="flex gap-4 pr-4">
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
        </div>
        {/* Bản copy để loop mượt */}
        <div className="flex gap-4 pr-4">
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
          <span className="text-caption font-bold tracking-[0.2em] text-ink-muted">{TEXT}</span>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP } from "../motion/gsap.ts";

const CARDS = [
  { title: "Bán hàng", desc: "Tạo đơn nhanh chóng", img: "3.jpg", accent: "bg-emerald-500" },
  { title: "Nhận hàng", desc: "Ghi nhận số lượng chính xác", img: "4.jpg", accent: "bg-sky-500" },
  { title: "Công nợ", desc: "Theo dõi dư nợ rõ ràng", img: "5.jpg", accent: "bg-amber-500" },
  { title: "Tồn kho", desc: "Quản lý sức chứa vựa", img: "6.jpg", accent: "bg-violet-500" },
  {
    title: "Giao hàng",
    desc: "Theo dõi trạng thái chuyến giao",
    img: "7.jpg",
    accent: "bg-rose-500",
  },
  { title: "Bảng giá", desc: "Cập nhật giá mỗi ngày", img: "8.jpg", accent: "bg-teal-500" },
];

export function Workflows() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          desktop: "(min-width: 1024px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { desktop, reduceMotion } = context.conditions!;

          if (reduceMotion || !desktop) return;
          if (!trackRef.current || !containerRef.current) return;

          // HORIZONTAL PAN: pin section, scroll ngang
          const getDistance = () => trackRef.current!.scrollWidth - window.innerWidth;

          const scrollTween = gsap.to(trackRef.current, {
            x: () => -getDistance(),
            ease: "none",
            scrollTrigger: {
              trigger: containerRef.current,
              start: "top top",
              end: () => `+=${getDistance()}`,
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
            },
          });

          // Parallax effect cho từng card dùng containerAnimation
          // Mỗi card nhúng xuống 40px rồi trồi lên khi cuộn qua
          gsap.utils.toArray<HTMLElement>(".wf-card").forEach((card) => {
            gsap.fromTo(
              card,
              { y: 40, autoAlpha: 0.5 },
              {
                y: 0,
                autoAlpha: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: card,
                  containerAnimation: scrollTween,
                  start: "left 100%",
                  end: "left 70%",
                  scrub: true,
                },
              },
            );
          });
        },
      );

      return () => mm.revert();
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="relative overflow-hidden bg-canvas py-20 lg:py-0">
      <div
        ref={trackRef}
        className="flex flex-col gap-6 px-4 lg:h-[100dvh] lg:flex-row lg:items-center lg:gap-8 lg:px-[10vw]"
      >
        {/* Intro block */}
        <div className="lg:w-[480px] lg:shrink-0 shrink-0 lg:pr-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-4">
            Quy trình
          </p>
          <h2 className="text-display font-bold text-ink text-4xl lg:text-5xl leading-tight">
            Mọi quy trình,
            <br />
            một nơi duy nhất.
          </h2>
          <p className="mt-6 text-body text-ink-muted max-w-sm leading-relaxed">
            Từ lúc rau vào vựa đến khi tiền về tay — tất cả luồng việc liên kết trực tiếp với nhau,
            không rời rạc.
          </p>
        </div>

        {/* Cards */}
        {CARDS.map((card, idx) => (
          <div
            key={idx}
            className="wf-card group relative flex flex-col rounded-3xl border border-border bg-surface shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 lg:w-[380px] lg:shrink-0 overflow-hidden"
          >
            {/* Accent bar */}
            <div className={`h-1 w-full ${card.accent}`} />

            <div className="relative h-[220px] w-full overflow-hidden">
              <Image
                src={`/images/${card.img}`}
                alt={card.title}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-2">
                <span className={`inline-block h-2 w-2 rounded-full ${card.accent}`} />
                <h3 className="text-lg font-bold text-ink">{card.title}</h3>
              </div>
              <p className="text-body-sm text-ink-muted leading-relaxed">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

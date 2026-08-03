"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger, useGSAP } from "../motion/gsap.ts";

const SCENES = [
  {
    title: "Ghi đơn siêu tốc",
    desc: "Ghi một đơn nhiều mặt hàng trong vài thao tác, tự động nhảy giá cho từng khách.",
    img: "1.jpg",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: "Đối soát công nợ",
    desc: "Biết ngay khách đang nợ bao nhiêu hay đang có tiền dư trước khi chốt đơn mới.",
    img: "9.jpg",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    title: "Kiểm soát hàng về",
    desc: "Tách bạch hàng đã đến, đã nhận và đã phân loại, tránh thất thoát.",
    img: "2.jpg",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
];

export function ProductShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);

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

          const sceneTriggers = gsap.utils.toArray<HTMLElement>(".scene-text");
          const images = gsap.utils.toArray<HTMLElement>(".scene-image");

          // Hiệu ứng entrance cho section heading
          gsap.from(".showcase-heading", {
            autoAlpha: 0,
            y: 40,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: ".showcase-heading",
              start: "top 85%",
              toggleActions: "play none none none",
            },
          });

          sceneTriggers.forEach((scene, index) => {
            ScrollTrigger.create({
              trigger: scene,
              start: "top 60%",
              end: "bottom 40%",
              onEnter: () => switchScene(index),
              onEnterBack: () => switchScene(index),
            });
          });

          function switchScene(index: number) {
            images.forEach((img, i) => {
              gsap.to(img, {
                autoAlpha: i === index ? 1 : 0,
                scale: i === index ? 1 : 0.95,
                duration: 0.5,
                ease: "power2.out",
              });
            });

            sceneTriggers.forEach((scene, i) => {
              gsap.to(scene, {
                autoAlpha: i === index ? 1 : 0.15,
                x: i === index ? 0 : 0,
                duration: 0.4,
              });
            });
          }
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="relative bg-canvas px-4 py-24 lg:py-0">
      <div className="mx-auto max-w-7xl">
        {/* Section heading */}
        <div className="showcase-heading text-center lg:text-left lg:pt-20 mb-16 lg:mb-0 lg:absolute lg:top-0 lg:left-0 lg:right-0 lg:px-4 lg:mx-auto lg:max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Trải nghiệm sản phẩm
          </p>
        </div>

        <div className="flex flex-col lg:flex-row relative">
          {/* LEFT — text scrolls */}
          <div className="flex flex-col lg:w-[45%] lg:pr-16 lg:pt-[25vh] lg:pb-[45vh] relative z-10">
            <div className="flex flex-col gap-20 lg:gap-[35vh]">
              {SCENES.map((scene, i) => (
                <div
                  key={i}
                  className="scene-text flex flex-col justify-center"
                  style={{ opacity: i === 0 ? 1 : 0.15 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {scene.icon}
                    </span>
                    <h3 className="text-2xl lg:text-3xl font-bold text-ink">{scene.title}</h3>
                  </div>
                  <p className="text-body text-ink-muted lg:text-lg max-w-md leading-relaxed pl-[52px]">
                    {scene.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — image sticks via CSS sticky */}
          <div className="mt-12 lg:mt-0 lg:w-[55%]">
            <div className="lg:sticky lg:top-[12vh] lg:h-[76vh] flex items-center justify-center">
              <div className="relative w-full max-w-lg h-[450px] lg:h-[650px] rounded-3xl bg-surface shadow-2xl overflow-hidden ring-1 ring-ink/5 border border-border">
                {/* Browser chrome bar */}
                <div className="flex items-center gap-2 px-4 py-3 bg-surface-muted border-b border-border">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-2 px-3 py-1 bg-surface rounded-md text-xs text-ink-muted text-center border border-border">
                    app.vuarau.com
                  </div>
                </div>

                {/* Image content */}
                {SCENES.map((scene, i) => (
                  <div
                    key={i}
                    className="scene-image absolute inset-0 top-[44px] overflow-hidden bg-surface-muted"
                    style={{
                      opacity: i === 0 ? 1 : 0,
                      visibility: i === 0 ? "inherit" : "hidden",
                    }}
                  >
                    <Image
                      src={`/images/${scene.img}`}
                      alt={scene.title}
                      fill
                      className="object-cover object-top"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

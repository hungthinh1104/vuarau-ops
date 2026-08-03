"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "../motion/gsap.ts";

const STATEMENTS = [
  {
    title: "Một lệnh — một kết quả",
    desc: "Không có chuyện thao tác một đằng, dữ liệu lưu một nẻo.",
    num: "01",
  },
  {
    title: "Không trùng lặp",
    desc: "Mất mạng và bấm tải lại? Đơn hàng không bao giờ bị tạo hai lần.",
    num: "02",
  },
  {
    title: "Tiền và hàng tách biệt",
    desc: "Hai sự thật độc lập, đối soát chính xác đến từng đồng.",
    num: "03",
  },
  {
    title: "Sửa sai an toàn",
    desc: "Sai được sửa, nhưng không bao giờ mất dấu lịch sử thay đổi.",
    num: "04",
  },
  {
    title: "Mọi thay đổi đều có nguồn",
    desc: "Biết rõ ai đã sửa giá, ai đã chốt đơn, vào lúc nào.",
    num: "05",
  },
];

export function Trust() {
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

          // Animate card-content children khi card sau đè lên
          const cardEls = gsap.utils.toArray<HTMLElement>(".stack-card");

          cardEls.forEach((card, i) => {
            if (i === cardEls.length - 1) return;
            const nextCard = cardEls[i + 1];
            if (nextCard === undefined) return;

            const innerContent = card.querySelector(".card-content");
            if (!innerContent) return;

            gsap.to(innerContent, {
              scale: 0.9,
              autoAlpha: 0.2,
              ease: "none",
              scrollTrigger: {
                trigger: nextCard,
                start: "top bottom",
                end: "top 20%",
                scrub: true,
              },
            });
          });
        },
      );
    },
    { scope: containerRef },
  );

  return (
    <section ref={containerRef} className="relative bg-canvas overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] rounded-full bg-emerald-500/5 blur-[150px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full bg-sky-500/5 blur-[120px]" />
      </div>

      {/* Intro card */}
      <div className="sticky top-0 h-[100dvh] flex items-center justify-center text-center bg-canvas w-full z-0 px-4">
        <div className="card-content">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-500 mb-6">
            Cam kết vận hành
          </p>
          <h2 className="font-bold text-ink text-4xl md:text-5xl lg:text-7xl leading-tight tracking-tight">
            Sự thật duy nhất,
            <br />
            không thoả hiệp.
          </h2>
          <p className="mt-6 text-ink-muted text-lg max-w-lg mx-auto">
            Năm nguyên tắc vận hành mà hệ thống Vựa Rau cam kết tuân thủ tuyệt đối.
          </p>
        </div>
      </div>

      {/* Stacking statement cards */}
      <div className="relative z-10 w-full pb-[10vh]">
        {STATEMENTS.map((s, i) => (
          <div
            key={i}
            className="stack-card sticky top-0 h-[100dvh] w-full flex flex-col items-center justify-center px-4"
          >
            <div className="card-content w-full max-w-4xl rounded-3xl border border-border bg-surface/95 p-10 lg:p-16 shadow-2xl backdrop-blur-xl ring-1 ring-ink/5">
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-16">
                {/* Number */}
                <span className="text-6xl lg:text-8xl font-black text-ink-muted/30 select-none shrink-0 leading-none">
                  {s.num}
                </span>
                <div className="flex-1">
                  <h3 className="text-2xl lg:text-3xl font-bold text-ink mb-3">{s.title}</h3>
                  <p className="text-ink-muted text-lg lg:text-xl leading-relaxed max-w-lg">
                    {s.desc}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

// Đăng ký plugins để tránh bị tree-shaking
// BỎ ScrollSmoother: nó dùng transform trên wrapper → phá vỡ position:fixed
// của mọi thẻ con (nav, pin-spacer...) và gây xung đột với ScrollTrigger pin.
// Landing page này không cần smooth scroll — native scroll là đủ.
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, useGSAP);
}

export { gsap, ScrollTrigger, SplitText, Flip, useGSAP };

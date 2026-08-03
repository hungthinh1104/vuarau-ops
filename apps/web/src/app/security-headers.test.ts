import nextConfig from "../../next.config.ts";
import { describe, expect, it } from "vitest";

describe("Next response security headers", () => {
  it("protects every browser route from framing, sniffing and unnecessary capabilities", async () => {
    const rules = await nextConfig.headers?.();
    const rule = rules?.find((entry) => entry.source === "/(.*)");
    const headers = new Map(rule?.headers.map((header) => [header.key, header.value]));

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });
});

import { expect, signIn, test } from "./harness/signed-in.ts";
import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

type WebVitals = {
  readonly lcp: number | null;
  readonly cls: number;
  readonly inp: number | null;
};

type WindowWithVitals = Window & {
  __vuarauVitals?: WebVitals;
};

const SAMPLE_COUNT = 8;
const CONSTRAINED_4G = {
  latencyMs: 150,
  downloadBytesPerSecond: 4_000_000 / 8,
  uploadBytesPerSecond: 1_500_000 / 8,
  cpuSlowdownRate: 4,
} as const;

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]!;
}

async function installVitalsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: { lcp: number | null; cls: number; inp: number | null } = {
      lcp: null,
      cls: 0,
      inp: null,
    };

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries.at(-1);
        if (last !== undefined) state.lcp = last.startTime;
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Unsupported browsers are rejected by the assertion that LCP is present.
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) state.cls += shift.value ?? 0;
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Unsupported browsers are rejected by the CLS assertion below.
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const interaction = entry as PerformanceEntry & { interactionId?: number };
          if (interaction.interactionId !== undefined) {
            state.inp = Math.max(state.inp ?? 0, entry.duration);
          }
        }
      });
      const observerOptions = {
        type: "event",
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number };
      observer.observe(observerOptions);
    } catch {
      // Unsupported browsers are rejected by the INP assertion below.
    }

    Object.defineProperty(window, "__vuarauVitals", {
      configurable: true,
      value: state,
    });
  });
}

async function emulateConstrainedAndroid(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: CONSTRAINED_4G.latencyMs,
    downloadThroughput: CONSTRAINED_4G.downloadBytesPerSecond,
    uploadThroughput: CONSTRAINED_4G.uploadBytesPerSecond,
  });
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: CONSTRAINED_4G.cpuSlowdownRate,
  });
}

async function readVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    const state = (window as WindowWithVitals).__vuarauVitals;
    if (state === undefined) throw new Error("Web Vitals observer was not installed");
    return { lcp: state.lcp, cls: state.cls, inp: state.inp };
  });
}

test.describe("TC-WEB-PERF — production UI Web Vitals", () => {
  test("Customers p75 stays within the product performance budget", async ({ page }) => {
    await installVitalsObserver(page);
    await emulateConstrainedAndroid(page);
    await signIn(page, "sales");
    await page.goto("/customers", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeVisible();

    const samples: WebVitals[] = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      if (index > 0) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeVisible();
      }

      await page.getByLabel("Tìm khách hàng").fill(`hiệu năng ${index}`);
      await page.waitForTimeout(150);
      samples.push(await readVitals(page));
    }

    const lcp = samples
      .map((sample) => sample.lcp)
      .filter((value): value is number => value !== null);
    const cls = samples.map((sample) => sample.cls);
    const inp = samples
      .map((sample) => sample.inp)
      .filter((value): value is number => value !== null);
    expect(lcp, JSON.stringify(samples)).toHaveLength(SAMPLE_COUNT);
    expect(inp, JSON.stringify(samples)).toHaveLength(SAMPLE_COUNT);

    const p75 = {
      lcp: percentile(lcp, 0.75),
      cls: percentile(cls, 0.75),
      inp: percentile(inp, 0.75),
    };

    const evidence = JSON.stringify(
      { sampleCount: SAMPLE_COUNT, profile: CONSTRAINED_4G, p75, samples },
      null,
      2,
    );
    const evidencePath = test.info().outputPath("web-vitals-p75.json");
    await writeFile(evidencePath, evidence, "utf8");
    await test.info().attach("web-vitals-p75.json", {
      path: evidencePath,
      contentType: "application/json",
    });

    expect(p75.lcp, JSON.stringify(p75)).toBeLessThanOrEqual(2_500);
    expect(p75.inp, JSON.stringify(p75)).toBeLessThanOrEqual(200);
    expect(p75.cls, JSON.stringify(p75)).toBeLessThanOrEqual(0.1);
  });
});

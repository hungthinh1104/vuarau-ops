import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TC-WEB-020 — no fixture data is reachable from a production route.
 *
 * `src/fixtures` exists for stories and component tests: fixed DTOs with names
 * like "Chị Lan — chợ Bình Điền" and a balance of 375.000 ₫. On a real screen,
 * every one of those is a lie a worker could act on.
 *
 * The demonstration route at `/demo` renders fixtures deliberately and says so;
 * it lives outside `(app)` for exactly this reason, and this check draws the line
 * where the code already does. A machine check rather than a convention, because
 * the failure mode — one import added during a hurried change — is invisible in
 * review and obvious to a user.
 */
const ROOT = join(import.meta.dirname, "../..");
const PRODUCTION_ROUTES = join(ROOT, "src/app/(app)");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith(".tsx") || entry.endsWith(".ts") ? [full] : [];
  });
}

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

describe("TC-WEB-020 — production routes carry no fixture data", () => {
  const files = sourceFiles(PRODUCTION_ROUTES);

  it("finds the production routes, so a moved folder fails loudly", () => {
    // Without this, renaming `(app)` would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(3);
  });

  it("no route under (app) imports from src/fixtures", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1]!;
        if (/(^|\/)fixtures(\/|$)/.test(specifier) || specifier.includes(".fixtures")) {
          offenders.push(`${relative(ROOT, file)} → ${specifier}`);
        }
      }
    }

    expect(offenders, `production routes importing fixtures:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("every production route is a server wrapper delegated to a client controller", () => {
    const pages = files.filter((file) => file.endsWith("page.tsx"));
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source.startsWith('"use client"'), relative(ROOT, page)).toBe(false);
      expect(source, relative(ROOT, page)).toMatch(/@\/ui\/controllers\//);
    }
  });

  it("mounts the application toast host exactly once", () => {
    const rootLayout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
    const appLayout = readFileSync(join(PRODUCTION_ROUTES, "layout.tsx"), "utf8");
    expect(rootLayout.match(/<Toaster\s*\/>/g)).toHaveLength(1);
    expect(appLayout).not.toMatch(/<Toaster\s*\/>/);
  });
});

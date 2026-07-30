import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Enforces the architectural boundaries in docs/10-ai-coding/REPO_MAP.md.
 *
 * A dependency-graph plugin would do this too, at the cost of a plugin, a config
 * format, and a rule language. This is ~100 lines and says exactly what it means.
 */

const ROOT = process.cwd();

type Boundary = {
  /** Path prefix the rule applies to. */
  readonly scope: string;
  /** Import specifiers that must not appear. Matched as a prefix. */
  readonly forbidden: readonly string[];
  readonly why: string;
  /** Files exempt from the rule, with a stated reason. */
  readonly exceptions?: readonly string[];
  /**
   * Specifiers allowed even though a `forbidden` prefix matches them.
   *
   * Needed for exactly one shape: a package whose barrel is off-limits but whose
   * subpaths are not. Checked before `forbidden`, and matched exactly rather than
   * by prefix, so widening it takes a deliberate line.
   */
  readonly allowedSpecifiers?: readonly string[];
};

const BOUNDARIES: readonly Boundary[] = [
  {
    scope: "packages/domain-contracts/src",
    forbidden: [
      "@vuarau/domain-kernel",
      "@vuarau/db",
      "@vuarau/api",
      "@trpc/",
      "drizzle-orm",
      "postgres",
      "next",
      "react",
      "node:",
    ],
    why: "Contracts are shapes only: Zod and nothing else (§7).",
  },
  {
    scope: "packages/domain-kernel/src",
    forbidden: [
      "@vuarau/db",
      "@vuarau/api",
      "@trpc/",
      "drizzle-orm",
      "postgres",
      "@supabase/",
      "next",
      "react",
      "node:",
      "zod",
      "@vuarau/test-fixtures",
    ],
    why: "The domain kernel is framework-free and deterministic (ADR-0003).",
    exceptions: [
      // Fixtures are a dev-only dependency; the kernel's own tests may use them,
      // production kernel code may not.
      "packages/domain-kernel/src/**/*.test.ts",
    ],
  },
  {
    scope: "packages/db/src",
    forbidden: ["@vuarau/api", "@trpc/", "next", "react"],
    why: "Persistence knows nothing about the application layer or transport.",
  },
  {
    scope: "packages/test-fixtures/src",
    forbidden: ["@vuarau/db", "@vuarau/api", "drizzle-orm", "postgres", "@trpc/"],
    why: "Fixtures are shared by every test project and must stay dependency-light.",
  },
  {
    scope: "apps/api/src",
    forbidden: ["@vuarau/web", "next", "react", "drizzle-orm"],
    why: "The API talks to persistence through ports, never the query builder directly.",
  },
  {
    scope: "apps/web/src",
    forbidden: [
      "@vuarau/db",
      "@vuarau/domain-kernel",
      "drizzle-orm",
      "postgres",
      "@trpc/server",
      "jose",
      "node:",
      // The barrel re-exports fixtures built on the kernel. The two kernel-free
      // subpaths below are what the browser actually needs.
      "@vuarau/test-fixtures",
    ],
    allowedSpecifiers: ["@vuarau/test-fixtures/ids", "@vuarau/test-fixtures/time"],
    why: "The browser gets contracts and nothing else: no persistence, no kernel, no Node.",
    exceptions: [
      /*
       * Both read source off disk to check a property of the repository, and
       * both run in Node. They live beside the UI because that is what they are
       * about, not because they ship with it.
       */
      "apps/web/src/ui/patterns/sale/catalog-coverage.test.ts",
      "apps/web/src/app/production-routes.test.ts",
    ],
  },
  {
    /*
     * `@vuarau/api` is imported for its **type** only — `AppRouter`, erased before
     * a bundler sees it. That is what gives the client full inference with no code
     * generation, and it is safe exactly as long as no value crosses.
     *
     * So the rule is not "never import it" but "import it in one file", and that
     * file is `api/trpc.ts`, where the `import type` is visible in review.
     */
    scope: "apps/web/src",
    forbidden: ["@vuarau/api"],
    why: "Only apps/web/src/api/trpc.ts may name the server package, and only as a type.",
    exceptions: ["apps/web/src/api/trpc.ts"],
  },
];

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;

async function* walk(directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      if (entry.name === ".next" || entry.name === "storybook-static") continue;
      yield* walk(full);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      yield full;
    }
  }
}

const GLOBSTAR = "<<globstar>>";

/** Supports the two forms the exception list needs: `*` and `**`. */
function matchesGlob(path: string, pattern: string): boolean {
  const body = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", GLOBSTAR)
    .replaceAll("*", "[^/]*")
    .replaceAll(GLOBSTAR, ".*");
  return new RegExp(`^${body}$`).test(path);
}

async function main(): Promise<void> {
  const violations: string[] = [];

  for (const boundary of BOUNDARIES) {
    for await (const file of walk(join(ROOT, boundary.scope))) {
      const relativePath = relative(ROOT, file);
      if (boundary.exceptions?.some((pattern) => matchesGlob(relativePath, pattern))) {
        continue;
      }

      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1]!;
        if (boundary.allowedSpecifiers?.includes(specifier)) continue;
        const forbidden = boundary.forbidden.find((banned) => specifier.startsWith(banned));
        if (forbidden !== undefined) {
          violations.push(
            `${relativePath}\n    imports "${specifier}" (banned: "${forbidden}")\n    ${boundary.why}`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error(`✗ ${violations.length} architectural boundary violation(s):\n`);
    for (const violation of violations) {
      console.error(`  ${violation}\n`);
    }
    process.exit(1);
  }

  console.log(`✓ boundary-check: ${BOUNDARIES.length} boundaries hold.`);
}

await main();

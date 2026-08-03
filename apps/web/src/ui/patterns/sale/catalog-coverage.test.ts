import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { UI_STATE_CATALOG } from "./catalog-state.ts";

/**
 * TC-WEB-012 — Storybook covers every state the UI state catalog names.
 *
 * Three things have to agree, and this asserts all three pairs:
 *
 *   the document   docs/06-api-contracts/ui-state-catalog.md, the source of truth
 *   the list       src/ui/patterns/sale/catalog-state.ts, the machine-readable copy
 *   the stories    every `coversState(...)` parameter in a *.stories.tsx
 *
 * A state added to the catalog and forgotten in Storybook fails here. So does a
 * story claiming a state the catalog does not name — which is how a "coverage"
 * number quietly stops meaning anything.
 *
 * This is the one test in the web project that reads the filesystem, so it runs in
 * the node environment by extension rather than in jsdom.
 */

const ROOT = join(import.meta.dirname, "../../../../../..");
const CATALOG_DOC = join(ROOT, "docs/06-api-contracts/ui-state-catalog.md");
const STORY_ROOT = join(ROOT, "apps/web/src");

/** The `- [ ] a · b · c` checklist at the end of the catalog. */
function statesInDocument(): Set<string> {
  const markdown = readFileSync(CATALOG_DOC, "utf8");
  const checklist = markdown.slice(markdown.indexOf("## Coverage checklist"));
  const states = new Set<string>();

  for (const line of checklist.split("\n")) {
    const item = /^-\s+\[[ x]\]\s+(.*)$/.exec(line);
    if (item === null) continue;
    for (const state of item[1]!.split("·")) {
      const name = state.trim();
      if (/^[a-z_]+$/.test(name)) states.add(name);
    }
  }
  return states;
}

function storyFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return storyFiles(full);
    return entry.endsWith(".stories.tsx") ? [full] : [];
  });
}

function statesInStories(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of storyFiles(STORY_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/coversState\(\s*"([a-z_]+)"\s*\)/g)) {
      const state = match[1]!;
      found.set(state, [...(found.get(state) ?? []), relative(ROOT, file)]);
    }
  }
  return found;
}

describe("TC-WEB-012 — every UI-state-catalog state has a Storybook story", () => {
  const documented = statesInDocument();
  const declared = new Set<string>(UI_STATE_CATALOG);
  const storied = statesInStories();

  it("the document names at least one state, so a parsing change fails loudly", () => {
    // Without this, a rename of the checklist heading would silently make every
    // assertion below trivially true.
    expect(documented.size).toBeGreaterThan(20);
  });

  it("the machine-readable list matches the document exactly", () => {
    expect([...declared].sort()).toEqual([...documented].sort());
  });

  it("every catalog state is covered by a story", () => {
    const missing = [...declared].filter((state) => !storied.has(state));
    expect(missing, `no story declares: ${missing.join(", ")}`).toEqual([]);
  });

  it("no story claims a state the catalog does not name", () => {
    const unknown = [...storied.keys()].filter((state) => !declared.has(state));
    expect(unknown, `stories claim unknown states: ${unknown.join(", ")}`).toEqual([]);
  });
});

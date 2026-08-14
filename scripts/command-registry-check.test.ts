import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCommandRegistry, transitionCommandNames } from "./command-registry-check.ts";

const base = {
  commands: [{ id: "sale.post", owner: "UC-SALE-002", classification: "lifecycle" }],
  catalog_aliases: { PostSale: "sale.post" },
};

test("command registry requires every runtime mutation to have an owner and classification", () => {
  const failures = checkCommandRegistry({
    registry: base,
    runtimeCommandIds: ["sale.post", "delivery.recordReturn"],
    traceUseCaseIds: new Set(["UC-SALE-002"]),
    transitionMarkdown: "| T-SALE-003 | Sale | `draft` → `posted` | `PostSale` | none | none |",
  });
  assert.ok(failures.some((failure) => failure.includes("delivery.recordReturn")));
});

test("transition aliases must resolve to runtime mutations", () => {
  const failures = checkCommandRegistry({
    registry: {
      commands: [{ id: "sale.post", owner: "UC-SALE-002", classification: "lifecycle" }],
      catalog_aliases: { PostSale: "sale.missing" },
    },
    runtimeCommandIds: ["sale.post"],
    traceUseCaseIds: new Set(["UC-SALE-002"]),
    transitionMarkdown: "| T-SALE-003 | Sale | `draft` → `posted` | `PostSale` | none | none |",
  });
  assert.ok(failures.some((failure) => failure.includes("non-runtime mutation")));
});

test("transition parser reads the business command column from catalog rows", () => {
  assert.deepEqual(
    transitionCommandNames(
      "| T-SALE-003 | Sale | `draft` → `posted` | `PostSale` | customer `+total` | none |\n" +
        "| T-VOID-001 | `VoidSale` | Sale void |",
    ),
    ["PostSale", "VoidSale"],
  );
});

import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";

/**
 * Keeps the documentation tree honest about itself: required files present,
 * relative links resolving, IDs unique, and no undated TODOs.
 *
 * It checks structure, not truth. A rule whose prose contradicts its code passes
 * here and fails docs/10-ai-coding/REVIEW_CHECKLIST.md.
 */

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");

/** Every document the bootstrap brief requires. Missing one fails the build. */
const REQUIRED = [
  "README.md",
  "00-product/product-brief.md",
  "00-product/scope.md",
  "00-product/validation-plan.md",
  "00-product/pilot-worksheet.md",
  "00-product/pilot-mode.md",
  "00-product/pilot-onboarding.md",
  "01-domain/glossary.md",
  "01-domain/context-map.md",
  "02-use-cases/use-case-catalog.md",
  "02-use-cases/UC-CUSTOMER-001-create-customer.md",
  "02-use-cases/customer-use-cases.md",
  "02-use-cases/UC-SALE-002-post-sale.md",
  "02-use-cases/sale-use-cases.md",
  "02-use-cases/UC-PAYMENT-001-record-customer-payment.md",
  "02-use-cases/UC-PAYMENT-002-reverse-customer-payment.md",
  "02-use-cases/UC-ACCOUNT-002-adjust-customer-account.md",
  "02-use-cases/customer-account-use-cases.md",
  "02-use-cases/UC-AUTH-001-authenticate-and-authorize.md",
  "02-use-cases/platform-use-cases.md",
  "03-state-machines/sale-state-machine.md",
  "03-state-machines/payment-state-machine.md",
  "03-state-machines/state-catalog.md",
  "03-state-machines/transition-catalog.md",
  "04-business-rules/sale-rules.md",
  "04-business-rules/payment-rules.md",
  "04-business-rules/customer-account-rules.md",
  "04-business-rules/error-code-catalog.md",
  "04-business-rules/authorization-rules.md",
  "04-business-rules/read-rules.md",
  "04-business-rules/operations-rules.md",
  "05-casebook/sale-cases.md",
  "05-casebook/payment-cases.md",
  "05-casebook/customer-account-cases.md",
  "05-casebook/read-cases.md",
  "06-api-contracts/command-contracts.md",
  "06-api-contracts/error-contract.md",
  "06-api-contracts/capabilities.md",
  "06-api-contracts/ui-state-catalog.md",
  "06-api-contracts/read-models.md",
  "07-data/data-model.md",
  "07-data/time-semantics.md",
  "07-data/ledger-model.md",
  "08-qa/test-strategy.md",
  "08-qa/ui-screen-coverage.md",
  "08-qa/traceability.md",
  "08-qa/risk-classification.md",
  "08-qa/manual-test-template.md",
  "08-qa/trace-map.yml",
  "09-decisions/ADR-0001-modular-monolith.md",
  "09-decisions/ADR-0002-command-based-writes.md",
  "09-decisions/ADR-0003-backend-owns-business-rules.md",
  "09-decisions/ADR-0004-append-only-debt-ledger.md",
  "09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md",
  "09-decisions/ADR-0006-integer-minor-units-for-money.md",
  "09-decisions/ADR-0007-explicit-transaction-and-recorded-time.md",
  "09-decisions/ADR-0008-idempotency-records.md",
  "09-decisions/ADR-0009-optimistic-concurrency.md",
  "09-decisions/ADR-0010-supabase-jwt-verification.md",
  "09-decisions/ADR-0011-role-permission-mapping.md",
  "09-decisions/ADR-0012-sale-void-and-replacement.md",
  "09-decisions/ADR-0013-sale-not-order.md",
  "09-decisions/ADR-0014-debt-recognition-at-posting.md",
  "09-decisions/ASM-002-debt-recognition-worksheet.md",
  "09-decisions/decision-backlog.md",
  "10-ai-coding/REPO_MAP.md",
  "10-ai-coding/TASK_TEMPLATE.md",
  "10-ai-coding/REVIEW_CHECKLIST.md",
  "10-ai-coding/CHANGE_PROTOCOL.md",
  "design.md",
  "WEB-ADMIN.md",
  "MOBILE-POS.md",
  "11-operations/deployment-contract.md",
  "11-operations/device-smoke-check.md",
];

/** Every ADR must argue its case, not merely state a conclusion. */
const ADR_SECTIONS = [
  "Status",
  "Context",
  "Decision",
  "Alternatives considered",
  "Consequences",
  "Revisit when",
];

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;

export type RoutingContractSources = Readonly<Record<string, string>>;

/** Regression checks for canonical routing docs and known stale claims. */
export function checkRoutingContracts(sources: RoutingContractSources): string[] {
  const failures: string[] = [];
  const read = (path: string): string => sources[path] ?? "";
  const requireText = (path: string, text: string, message: string): void => {
    if (!read(path).includes(text)) failures.push(`${path}: ${message}`);
  };

  const authorityPath = "docs/README.md";
  const authority = read(authorityPath);
  const authorityMarkers = [
    "**Runtime and persistence facts**",
    "**Recorded business decisions**",
    "**Normative business documentation**",
    "**Published interface contracts**",
    "**UI policy**",
    "**Evidence and release status**",
  ];
  let previous = -1;
  for (const marker of authorityMarkers) {
    const position = authority.indexOf(marker);
    if (position === -1) {
      failures.push(`${authorityPath}: missing canonical authority-order marker ${marker}`);
    } else if (position <= previous) {
      failures.push(`${authorityPath}: authority-order markers are out of order`);
    }
    previous = position;
  }

  const repoMapPath = "docs/10-ai-coding/REPO_MAP.md";
  for (const marker of [
    "apps/web/src/app/(app)/",
    "apps/web/e2e/",
    "m13-offline-quick-sale.spec.ts",
    "next start",
    "scripts/context.ts",
    "scripts/dev.ts",
    "scripts/docs-check.ts",
    "packages/domain-contracts",
    "packages/domain-kernel",
    "packages/db",
    "packages/test-fixtures",
    "packages/config",
  ]) {
    requireText(repoMapPath, marker, `current repository map must mention ${marker}`);
  }
  for (const stale of ["one demonstration route", "Playwright skeleton"]) {
    if (read(repoMapPath).toLowerCase().includes(stale.toLowerCase())) {
      failures.push(`${repoMapPath}: stale repository claim remains: ${stale}`);
    }
  }

  const reviewPath = "docs/10-ai-coding/REVIEW_CHECKLIST.md";
  requireText(
    reviewPath,
    "may import `domain-contracts` and `domain-kernel`",
    "db boundary must allow domain-kernel",
  );
  requireText(
    reviewPath,
    "must not\n      import anything from `apps/*`",
    "db boundary must forbid apps/*",
  );
  if (/packages\/db` does not import `domain-kernel`/.test(read(reviewPath))) {
    failures.push(`${reviewPath}: stale db prohibition contradicts the enforced boundary`);
  }

  const changePath = "docs/10-ai-coding/CHANGE_PROTOCOL.md";
  requireText(
    changePath,
    "[docs/README.md](../README.md)",
    "must defer authority order to docs/README.md",
  );
  requireText(
    changePath,
    "runtime and persistence facts outrank every document",
    "must preserve runtime-first authority",
  );
  if (
    /The docs are the\s+specification, not a description written afterwards/.test(read(changePath))
  ) {
    failures.push(`${changePath}: documentation-first wording overrides the authority order`);
  }

  const standardPath = "docs/10-ai-coding/ENGINEERING_STANDARD.md";
  requireText(
    standardPath,
    "[REPO_MAP.md](REPO_MAP.md)",
    "must reference the canonical dependency map",
  );
  if (read(standardPath).includes("contracts ← domain kernel ← application")) {
    failures.push(`${standardPath}: must not define a second dependency graph`);
  }

  return failures;
}

async function* walkMarkdown(directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(full);
    } else if (entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

async function main(): Promise<void> {
  // ---- required documents --------------------------------------------------
  for (const required of REQUIRED) {
    if (!existsSync(join(DOCS, required))) {
      fail(`Missing required document: docs/${required}`);
    }
  }

  const routingPaths = [
    "docs/README.md",
    "docs/10-ai-coding/REPO_MAP.md",
    "docs/10-ai-coding/REVIEW_CHECKLIST.md",
    "docs/10-ai-coding/CHANGE_PROTOCOL.md",
    "docs/10-ai-coding/ENGINEERING_STANDARD.md",
  ];
  const routingSources = Object.fromEntries(
    routingPaths.map((path) => [path, readFileSync(join(ROOT, path), "utf8")]),
  );
  for (const failure of checkRoutingContracts(routingSources)) fail(failure);

  const definedIds = new Map<string, string>();
  let linkCount = 0;
  let fileCount = 0;

  for await (const file of walkMarkdown(DOCS)) {
    const source = readFileSync(file, "utf8");
    const relativePath = relative(ROOT, file);

    // Archive documents are retained for history but are not part of the active
    // authority graph. They may contain old links, IDs, and status snapshots.
    if (relativePath.startsWith("docs/archive/")) continue;
    fileCount += 1;

    for (const line of source.split("\n")) {
      if (
        /(?:docs\/archive\/|(?:\.\.\/)*archive\/)/i.test(line) &&
        /(authorit|normative|source[- ]of[- ]truth)/i.test(line)
      ) {
        fail(
          `${relativePath}: archive documents cannot be treated as authoritative; ` +
            "use active docs and routing sources instead",
        );
      }
    }

    // ---- relative links resolve -------------------------------------------
    for (const match of source.matchAll(LINK_PATTERN)) {
      const target = match[1]!;
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      linkCount += 1;
      const [path] = target.split("#");
      const resolved = normalize(join(dirname(file), path ?? ""));
      if (!existsSync(resolved)) {
        fail(`${relativePath}: broken link → ${target}`);
      }
    }

    // ---- ids are defined once ---------------------------------------------
    // Only headings define an id; body text merely references one.
    for (const line of source.split("\n")) {
      const heading = /^#{1,4}\s+((?:UC|BR|CASE|ADR)-[A-Z0-9-]+)/.exec(line);
      if (heading !== null) {
        const id = heading[1]!;
        const existing = definedIds.get(id);
        if (existing !== undefined && existing !== relativePath) {
          fail(`Duplicate definition of ${id}: ${existing} and ${relativePath}`);
        }
        definedIds.set(id, relativePath);
      }
    }

    // ---- TODOs must name an owner or a backlog reference ------------------
    // Matches an actual marker (`TODO:` / `TODO(name)`), not prose that happens
    // to discuss the word — the review checklist is allowed to mention it.
    for (const [index, line] of source.split("\n").entries()) {
      if (/\bTODO\b\s*[:(]/.test(line) && !/ASM-\d+|@[a-z]/i.test(line)) {
        fail(`${relativePath}:${index + 1}: TODO without an owner or backlog reference`);
      }
    }

    // ---- ADRs argue their case --------------------------------------------
    if (relativePath.includes("09-decisions/ADR-")) {
      for (const section of ADR_SECTIONS) {
        if (!source.toLowerCase().includes(section.toLowerCase())) {
          fail(`${relativePath}: ADR is missing a "${section}" section`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`✗ docs-check: ${failures.length} problem(s)\n`);
    for (const failure of failures) {
      console.error(`  • ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `✓ docs-check: ${fileCount} documents, ${linkCount} internal links, ` +
      `${definedIds.size} ids — all resolve.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

export interface SourceBoundaryManifest {
  readonly sourceRoots: readonly string[];
  readonly compositionFiles: readonly string[];
  readonly allowlistSegments: readonly string[];
  readonly warningLines: number;
  readonly failureLines: number;
  readonly compositionMaximumLines: number;
}

/**
 * Composition entry points are explicit architecture boundaries, not every
 * generic `index.ts`. Add one repository-relative path here when a new entry
 * point is introduced; the source-boundary checker applies the stricter size
 * and raw-SQL rules to every declared path.
 */
export const sourceBoundaryManifest: SourceBoundaryManifest = {
  sourceRoots: ["apps", "packages"],
  compositionFiles: [
    "packages/db/src/repositories/index.ts",
    "packages/db/src/repositories/read-queries.ts",
    "apps/api/src/infrastructure/persistence/in-memory/in-memory-unit-of-work.ts",
    "apps/api/src/infrastructure/persistence/in-memory/index.ts",
    "apps/api/src/infrastructure/persistence/in-memory/transaction.ts",
    "apps/api/src/infrastructure/trpc/router.ts",
  ],
  allowlistSegments: [
    "/migrations/",
    "/generated/",
    "/fixtures/",
    "/e2e/",
    "/storybook-static/",
    "/.next/",
    "/.next-e2e/",
  ],
  warningLines: 450,
  failureLines: 700,
  compositionMaximumLines: 250,
};

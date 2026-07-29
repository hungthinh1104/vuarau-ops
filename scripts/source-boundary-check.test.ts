import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkSourceBoundaries } from "./source-boundary-core.ts";
import { sourceBoundaryManifest, type SourceBoundaryManifest } from "./source-boundary-manifest.ts";

async function checkFixture(
  files: Readonly<Record<string, string>>,
  compositionFiles: readonly string[] = [],
) {
  const root = await mkdtemp(join(tmpdir(), "vuarau-source-boundary-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      const absolutePath = join(root, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source);
    }
    const manifest: SourceBoundaryManifest = {
      ...sourceBoundaryManifest,
      sourceRoots: ["apps"],
      compositionFiles,
    };
    return await checkSourceBoundaries(root, manifest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `export const line${index} = ${index};`).join(
    "\n",
  );
}

test("fails an oversized hand-written production file", async () => {
  const result = await checkFixture({ "apps/feature/large.ts": lines(701) });

  assert.deepEqual(result.failures, ["apps/feature/large.ts: 701 lines (maximum 700)"]);
});

test("fails an oversized declared composition file at its stricter limit", async () => {
  const path = "apps/api/composition.ts";
  const result = await checkFixture({ [path]: lines(251) }, [path]);

  assert.deepEqual(result.failures, [
    "apps/api/composition.ts: composition file has 251 lines (maximum 250)",
  ]);
});

test("fails raw SQL in a declared composition file", async () => {
  const path = "apps/api/composition.ts";
  const result = await checkFixture(
    { [path]: "export const query = sql`select id from customers`;" },
    [path],
  );

  assert.deepEqual(result.failures, ["apps/api/composition.ts: composition file contains raw SQL"]);
});

test("accepts a small SQL-free declared composition file", async () => {
  const path = "apps/api/composition.ts";
  const result = await checkFixture({ [path]: 'export { customerRouter } from "./customer.ts";' }, [
    path,
  ]);

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.checked, 1);
});

test("does not classify an undeclared generic index as composition", async () => {
  const result = await checkFixture({ "apps/feature/index.ts": lines(251) });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.checked, 1);
});

test("excludes generated, fixture, test, and E2E files", async () => {
  const result = await checkFixture({
    "apps/feature/valid.ts": "export const valid = true;",
    "apps/generated/large.ts": lines(701),
    "apps/fixtures/large.ts": lines(701),
    "apps/e2e/large.ts": lines(701),
    "apps/feature/large.test.ts": lines(701),
  });

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.checked, 1);
});

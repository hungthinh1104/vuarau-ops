import { test } from "node:test";
import assert from "node:assert/strict";
import { requireCleanReleaseManifest } from "./release-manifest.ts";

test("release manifest refuses an unclean or non-exact identity", () => {
  assert.throws(
    () =>
      requireCleanReleaseManifest({
        releaseSha: "not-a-sha",
        diffCheckPassed: true,
        treeClean: true,
      }),
    /exact HEAD SHA/,
  );
  assert.throws(
    () =>
      requireCleanReleaseManifest({
        releaseSha: "a".repeat(40),
        diffCheckPassed: false,
        treeClean: true,
      }),
    /clean tree/,
  );
});

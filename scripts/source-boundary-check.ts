import { checkSourceBoundaries } from "./source-boundary-core.ts";
import { sourceBoundaryManifest } from "./source-boundary-manifest.ts";

const ROOT = process.cwd();

async function main(): Promise<void> {
  const result = await checkSourceBoundaries(ROOT, sourceBoundaryManifest);

  for (const warning of result.warnings) console.warn(`⚠ source-boundary-check: ${warning}`);
  if (result.failures.length > 0) {
    console.error(`✗ source-boundary-check: ${result.failures.length} violation(s)`);
    for (const failure of result.failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `✓ source-boundary-check: ${result.checked} hand-written files checked; ${result.warnings.length} warning(s).`,
  );
}

await main();

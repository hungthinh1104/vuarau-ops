import { checkUiArchitecture } from "./ui-architecture-check.ts";

const result = await checkUiArchitecture(process.cwd());
if (result.failures.length > 0) {
  console.error(`✗ ui-architecture-check: ${result.failures.length} violation(s)`);
  for (const failure of result.failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`✓ ui-architecture-check: ${result.checked} production files checked.`);

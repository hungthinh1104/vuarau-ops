import { beforeEach } from "vitest";
import { setLogSink } from "../infrastructure/logging.ts";

/**
 * Server logs go nowhere during tests, unless a test asks for them.
 *
 * Every command emits one structured line (BR-OPS-001), which is right in a
 * deployment and useless in a test run — 200 commands become 200 lines of JSON
 * between the assertions somebody is actually reading.
 *
 * Reset per test rather than once, so a test that installed its own sink cannot
 * leak it into the next file. `logging.app.test.ts` installs one deliberately.
 */
beforeEach(() => {
  setLogSink(() => undefined);
});

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom keeps the document between tests; Testing Library does not clean up on
 * its own without globals. Without this, a `getByRole` in the second test finds
 * the first test's button and passes for the wrong reason.
 */
afterEach(cleanup);

import { describe, expect, it } from "vitest";
import { requestIdOf } from "./request-id.ts";

function responseError(requestId: string | null) {
  return {
    meta: {
      response: {
        headers: {
          get: (name: string) => (name === "x-request-id" ? requestId : null),
        },
      },
    },
  };
}

describe("requestIdOf", () => {
  it("reads the bounded correlation id from a response", () => {
    expect(requestIdOf(responseError("req-1234.alpha"))).toBe("req-1234.alpha");
  });

  it("rejects missing, malformed and oversized ids", () => {
    expect(requestIdOf(responseError(null))).toBeNull();
    expect(requestIdOf(responseError("token\nleak"))).toBeNull();
    expect(requestIdOf(responseError("x".repeat(129)))).toBeNull();
  });

  it("does not turn ordinary transport errors into a fake support id", () => {
    expect(requestIdOf(new Error("Failed to fetch"))).toBeNull();
    expect(requestIdOf({ meta: { response: { headers: {} } } })).toBeNull();
  });
});

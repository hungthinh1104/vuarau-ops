import { describe, expect, it } from "vitest";
import { operationsControlException, operationsControlExceptionSchema } from "./exceptions.ts";

describe("operations control exceptions", () => {
  it("TC-OPS-025 — keeps stale realtime state source-backed and recoverable", () => {
    const exception = operationsControlException(
      "stale_realtime",
      { kind: "workspace", reference: "WORKSPACE-ABC12345", id: "workspace-1" },
      [{ key: "connection_state", value: "stale" }],
    );

    expect(operationsControlExceptionSchema.parse(exception)).toMatchObject({
      kind: "stale_realtime",
      severity: "high",
      sourceFacts: [{ key: "connection_state", value: "stale" }],
      nextAction: {
        label: "Kết nối lại realtime và tải lại dữ liệu nếu trạng thái chưa trở về live.",
      },
      resolutionCondition: "Kênh realtime ở trạng thái live và durable change feed đã được drain.",
    });
  });

  it("TC-OPS-025 — describes close blocked as an explicit workspace exception", () => {
    const exception = operationsControlException(
      "operational_close_blocked",
      { kind: "workspace", reference: "CLOSE-2026-08-14", id: "workspace-1" },
      [
        { key: "business_date", value: "2026-08-14" },
        { key: "blockers", value: "missing_observation" },
      ],
      "/workspace/operations",
    );

    expect(exception).toMatchObject({
      kind: "operational_close_blocked",
      severity: "critical",
      source: { kind: "workspace", reference: "CLOSE-2026-08-14" },
      nextAction: {
        label: "Mở Điều kiện chốt ngày để xử lý từng blocker.",
        href: "/workspace/operations",
      },
    });
  });
});

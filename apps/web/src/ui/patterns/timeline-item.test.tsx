import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AccountTimelineEntryDto } from "@vuarau/domain-contracts";
import { TimelineItem } from "./timeline-item.tsx";

const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  customerId: "00000000-0000-4000-8000-000000000003",
  amount: { amountMinor: -200_000, currency: "VND" },
  runningBalance: { amountMinor: 300_000, currency: "VND" },
  classification: "receivable",
  source: {
    type: "payment",
    id: "00000000-0000-4000-8000-000000000004",
    document: { type: "payment", id: "00000000-0000-4000-8000-000000000004" },
    label: "Tiền mặt",
  },
  reversalOfEntryId: null,
  reasonCode: null,
  reason: null,
  transactionTime: "2026-07-28T08:00:00.000Z",
  recordedAt: "2026-07-28T08:00:00.000Z",
  actorId: "00000000-0000-4000-8000-000000000005",
  commandId: "00000000-0000-4000-8000-000000000006",
} as unknown as AccountTimelineEntryDto;

describe("TimelineItem", () => {
  it("links a payment entry to its server-resolved source document", () => {
    render(
      <TimelineItem entry={entry} sourceHref="/payments/00000000-0000-4000-8000-000000000004" />,
    );
    expect(screen.getByRole("link", { name: "Tiền mặt" })).toHaveAttribute(
      "href",
      "/payments/00000000-0000-4000-8000-000000000004",
    );
  });
});

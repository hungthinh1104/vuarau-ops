import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalancePreview } from "./patterns/balance-preview.tsx";

/**
 * TC-WEB-019 — the payment preview never renders a credit as a negative debt.
 *
 * The preview is the moment somebody decides whether to take the money, so a
 * mis-worded balance here is worse than one on a read-only screen: it is wrong
 * *before* the decision rather than after it.
 *
 * The classification comes from `classifyBalance` in `domain-contracts` — the
 * same implementation every server read uses (BR-ACCOUNT-009) — rather than from
 * a second `<` in the browser.
 */
const vnd = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

describe("TC-WEB-019 — balance preview", () => {
  it("says the depot will owe the customer when a payment overshoots", () => {
    render(
      <BalancePreview
        currentBalance={vnd(500_000)}
        currentClassification="receivable"
        change={vnd(-800_000)}
        changeLabel="Khách trả"
      />,
    );

    expect(screen.getByText("Vựa nợ khách sau giao dịch")).toBeInTheDocument();
    expect(screen.getByText("300.000 ₫")).toBeInTheDocument();
    // Never a minus sign against the resulting balance, in either dash form.
    expect(screen.queryByText(/[-−]\s?300\.000/)).toBeNull();
  });

  it("explains an overpayment rather than warning about it", () => {
    render(
      <BalancePreview
        currentBalance={vnd(500_000)}
        currentClassification="receivable"
        change={vnd(-800_000)}
        changeLabel="Khách trả"
      />,
    );

    // Valid and expected (BR-ACCOUNT-007). A customer who hands over more than
    // they owe has not done anything wrong.
    expect(screen.getByText(/Khách trả dư/)).toBeInTheDocument();
    expect(screen.getByText(/trừ vào đơn sau/)).toBeInTheDocument();
  });

  it("says nothing extra when the payment exactly settles the account", () => {
    render(
      <BalancePreview
        currentBalance={vnd(500_000)}
        currentClassification="receivable"
        change={vnd(-500_000)}
        changeLabel="Khách trả"
      />,
    );

    expect(screen.getByText("Hết nợ sau giao dịch")).toBeInTheDocument();
    expect(screen.queryByText(/Khách trả dư/)).toBeNull();
  });

  it("leaves a partial payment as a receivable", () => {
    render(
      <BalancePreview
        currentBalance={vnd(875_000)}
        currentClassification="receivable"
        change={vnd(-500_000)}
        changeLabel="Khách trả"
      />,
    );

    expect(screen.getByText("Còn nợ sau giao dịch")).toBeInTheDocument();
    expect(screen.getByText("375.000 ₫")).toBeInTheDocument();
  });

  it("marks itself a prediction, because the server's answer is the real one", () => {
    render(
      <BalancePreview
        currentBalance={vnd(500_000)}
        currentClassification="receivable"
        change={vnd(-200_000)}
        changeLabel="Khách trả"
      />,
    );

    expect(screen.getByText(/Số dự kiến/)).toBeInTheDocument();
  });

  it("does not repeat the credit explanation when the account was already in credit", () => {
    // Already a credit, paying more: nothing new to explain.
    render(
      <BalancePreview
        currentBalance={vnd(-100_000)}
        currentClassification="customer_credit"
        change={vnd(-50_000)}
        changeLabel="Khách trả"
      />,
    );

    expect(screen.queryByText(/Khách trả dư/)).toBeNull();
    expect(screen.getByText("Vựa nợ khách sau giao dịch")).toBeInTheDocument();
  });
});

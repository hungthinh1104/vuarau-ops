import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BalanceCard } from "../patterns/finance/balance-card.tsx";
import { PaymentStatus } from "../patterns/payment/payment-status.tsx";
import { describeBalance, formatMoney, formatQuantity, formatSignedMoney } from "../format.ts";
import { parseMoneyText, parseQuantityText } from "./numeric-text.ts";
import {
  balanceCustomerCredit,
  balanceReceivable,
  balanceSettled,
} from "@/fixtures/account.fixtures.ts";
import { paymentPartiallyReversed } from "@/fixtures/payment.fixtures.ts";

/**
 * TC-WEB-003 — a customer credit is never rendered as a negative debt.
 *
 * The failure this prevents is not cosmetic: a worker who reads "nợ −500.000" goes
 * to collect money from somebody the depot owes. The classification comes from the
 * server (BR-ACCOUNT-009) precisely so that no client has to reason about the sign,
 * and these tests assert that no client does.
 */
describe("TC-WEB-003 — customer credit is not a negative debt", () => {
  it("words a credit as money the depot owes, with no minus sign", () => {
    render(
      <BalanceCard
        customerName="Cô Hoà"
        balance={balanceCustomerCredit.balance}
        classification={balanceCustomerCredit.classification}
      />,
    );

    expect(screen.getByText("Vựa nợ khách")).toBeInTheDocument();
    expect(screen.getByText("500.000 ₫")).toBeInTheDocument();
    // Neither the ASCII hyphen nor the typographic minus may reach the screen.
    expect(screen.queryByText(/[-−]\s*500/)).toBeNull();
    expect(screen.queryByText(/Còn nợ/)).toBeNull();
  });

  it("says 'hết nợ' rather than showing a zero that reads like a placeholder", () => {
    render(
      <BalanceCard
        customerName="Anh Tuấn"
        balance={balanceSettled.balance}
        classification={balanceSettled.classification}
      />,
    );

    expect(screen.getByText("Hết nợ")).toBeInTheDocument();
    expect(screen.queryByText("0 ₫")).toBeNull();
  });

  it("describeBalance never inspects the sign", () => {
    // Same magnitude, opposite meanings — decided entirely by classification.
    expect(describeBalance({ amountMinor: -500_000, currency: "VND" }, "customer_credit")).toEqual({
      label: "Vựa nợ khách",
      amount: "500.000 ₫",
      tone: "credit",
    });
    expect(describeBalance({ amountMinor: 500_000, currency: "VND" }, "receivable")).toEqual({
      label: "Còn nợ",
      amount: "500.000 ₫",
      tone: "receivable",
    });
  });
});

/**
 * TC-WEB-004 — loading never renders a temporary `0 ₫`.
 *
 * There is no path through `BalanceCard` that formats a balance it does not have,
 * and this asserts it from the outside: with no balance, no currency symbol
 * appears at all.
 */
describe("TC-WEB-004 — loading shows no amount", () => {
  it("renders a busy placeholder instead of a number", () => {
    const { container } = render(
      <BalanceCard customerName="Chị Lan" balance={null} classification={null} />,
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Đang tải công nợ")).toBeInTheDocument();
    expect(container.textContent).not.toContain("₫");
    expect(container.textContent).not.toContain("0");
  });

  it("shows the real balance once it arrives", () => {
    render(
      <BalanceCard
        customerName="Chị Lan"
        balance={balanceReceivable.balance}
        classification={balanceReceivable.classification}
      />,
    );

    expect(screen.getByText("375.000 ₫")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("TC-WEB-005 — money and quantity are integers or refusals", () => {
  it("formats without abbreviating", () => {
    expect(formatMoney({ amountMinor: 12_500_000, currency: "VND" })).toBe("12.500.000 ₫");
    expect(formatSignedMoney({ amountMinor: -500_000, currency: "VND" })).toBe("−500.000 ₫");
    expect(formatQuantity({ valueScaled: 12_500, unit: "kg" })).toBe("12,5 kg");
    expect(formatQuantity({ valueScaled: 30_000, unit: "bo" })).toBe("30 bó");
  });

  it("accepts grouped digits and rejects a fractional đồng rather than rounding", () => {
    expect(parseMoneyText("875.000", "VND")).toEqual({
      ok: true,
      value: { amountMinor: 875_000, currency: "VND" },
    });
    expect(parseMoneyText("875000", "VND")).toEqual({
      ok: true,
      value: { amountMinor: 875_000, currency: "VND" },
    });

    // Rounding is a business rule and lives in the kernel. The browser refuses.
    const fractional = parseMoneyText("875.000,5", "VND");
    expect(fractional.ok).toBe(false);

    const letters = parseMoneyText("tám trăm", "VND");
    expect(letters.ok).toBe(false);

    expect(parseMoneyText("900000000000000000000", "VND")).toEqual({
      ok: false,
      reason: "Số tiền quá lớn hoặc không còn chính xác.",
    });
  });

  it("scales quantity to milli-units and refuses a fourth decimal", () => {
    expect(parseQuantityText("12,5", "kg")).toEqual({
      ok: true,
      value: { valueScaled: 12_500, unit: "kg" },
    });
    expect(parseQuantityText("0,001", "kg")).toEqual({
      ok: true,
      value: { valueScaled: 1, unit: "kg" },
    });
    expect(parseQuantityText("0,0001", "kg").ok).toBe(false);
    expect(parseQuantityText("9000000000000000", "kg")).toEqual({
      ok: false,
      reason: "Số lượng quá lớn hoặc không còn chính xác.",
    });
  });

  it("treats an empty field as absent, not as zero", () => {
    expect(parseMoneyText("", "VND")).toEqual({ ok: true, value: null });
    expect(parseQuantityText("   ", "kg")).toEqual({ ok: true, value: null });
  });
});

describe("TC-WEB-006 — a partially reversed payment shows all three amounts", () => {
  it("renders original, reversed and remaining", () => {
    render(
      <PaymentStatus
        status={paymentPartiallyReversed.status}
        amount={paymentPartiallyReversed.amount}
        reversedAmount={paymentPartiallyReversed.reversedAmount}
        remainingReversibleAmount={paymentPartiallyReversed.remainingReversibleAmount}
      />,
    );

    expect(screen.getByText("Đã hoàn")).toBeInTheDocument();
    expect(screen.getByText("200.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Còn hoàn được")).toBeInTheDocument();
    expect(screen.getByText("300.000 ₫")).toBeInTheDocument();
    // The original appears twice: in the header and in the breakdown.
    expect(screen.getAllByText("500.000 ₫").length).toBeGreaterThan(0);
  });

  it("shows one amount when nothing has been reversed", () => {
    render(
      <PaymentStatus
        status="recorded"
        amount={{ amountMinor: 500_000, currency: "VND" }}
        reversedAmount={{ amountMinor: 0, currency: "VND" }}
        remainingReversibleAmount={{ amountMinor: 500_000, currency: "VND" }}
      />,
    );

    expect(screen.queryByText("Còn hoàn được")).toBeNull();
  });
});

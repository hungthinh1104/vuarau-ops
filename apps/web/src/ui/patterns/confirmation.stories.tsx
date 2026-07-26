import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmationSummary } from "./confirmation-summary.tsx";
import { MoneyImpact } from "./money-impact.tsx";
import { CapabilityAction } from "./capability-action.tsx";
import { TimelineItem } from "./timeline-item.tsx";
import { WorkspaceShell } from "./workspace-shell.tsx";
import { Textarea } from "../primitives/textarea.tsx";
import { formatMoney, formatQuantity } from "../format.ts";
import { accountTimeline } from "../../fixtures/account.fixtures.ts";
import { ownerSession, salesSession, WORKSPACE_NAME } from "../../fixtures/session.fixtures.ts";
import { saleLines, salePosted, saleVoided } from "../../fixtures/sale.fixtures.ts";
import { vnd } from "../../fixtures/session.fixtures.ts";

const meta = { title: "Patterns/Confirmation and impact" } satisfies Meta;
export default meta;
type Story = StoryObj;

/**
 * The three-line consequence from design.md, with the final figure strongest.
 *
 * `resultingBalance` is a **server-computed projection**, not `current + change`
 * worked out here. The moment a component adds two amounts to show a consequence,
 * the screen has its own opinion about a balance.
 */
export const Impact: Story = {
  name: "MoneyImpact — hậu quả trước khi bấm",
  render: () => (
    <div className="max-w-md">
      <MoneyImpact
        currentBalance={vnd(11_350_000)}
        currentClassification="receivable"
        change={vnd(1_350_000)}
        changeLabel="Đơn mới"
        resultingBalance={vnd(12_700_000)}
        resultingClassification="receivable"
      />
    </div>
  ),
};

/** A transaction that pushes the account into credit, worded as one. */
export const ImpactIntoCredit: Story = {
  name: "MoneyImpact — trả dư thành vựa nợ khách",
  render: () => (
    <div className="max-w-md">
      <MoneyImpact
        currentBalance={vnd(375_000)}
        currentClassification="receivable"
        change={vnd(-875_000)}
        changeLabel="Thu tiền mặt"
        resultingBalance={vnd(-500_000)}
        resultingClassification="customer_credit"
      />
    </div>
  ),
};

export const VoidConfirmation: Story = {
  name: "ConfirmationSummary — hoàn tác đơn đã chốt",
  render: () => (
    <div className="max-w-lg">
      <ConfirmationSummary
        subject="Hoàn tác đơn 875.000 ₫ — Chị Lan chợ Bình Điền"
        lines={[
          { label: "Ngày giao dịch", value: "20/07/2026" },
          ...saleLines.map((line) => ({
            label: `${line.productName} · ${formatQuantity(line.quantity)}`,
            value: formatMoney(line.lineTotal),
          })),
          { label: "Tổng đơn", value: formatMoney(salePosted.totalAmount) },
        ]}
        impact={
          <MoneyImpact
            currentBalance={vnd(875_000)}
            currentClassification="receivable"
            change={vnd(-875_000)}
            changeLabel="Hoàn tác đơn"
            resultingBalance={vnd(0)}
            resultingClassification="settled"
          />
        }
        consequence="Đơn vẫn nằm trong sổ và vẫn xem được. Hệ thống ghi thêm một dòng công nợ ngược lại đúng bằng tổng đơn — không sửa đơn cũ."
        warning="Nếu chỉ ghi sai vài dòng hàng, hãy hoàn tác rồi tạo đơn thay thế thay vì điều chỉnh công nợ."
        reason={
          <Textarea
            label="Lý do hoàn tác"
            required
            hint="Người tra lại sổ sau này sẽ đọc đúng dòng này."
            defaultValue={saleVoided.voidRecord?.reason ?? ""}
          />
        }
        action={
          <CapabilityAction
            label="Hoàn tác đơn"
            tone="danger-solid"
            capability={{ allowed: true }}
            permission="sale.void"
            session={ownerSession}
            onAction={() => undefined}
          />
        }
      />
    </div>
  ),
};

/** The same confirmation for somebody who may not void. The reason is visible. */
export const VoidConfirmationWithoutPermission: Story = {
  name: "CapabilityAction — bán hàng không được hoàn tác",
  render: () => (
    <div className="max-w-md">
      <CapabilityAction
        label="Hoàn tác đơn"
        tone="danger"
        capability={{ allowed: true }}
        permission="sale.void"
        session={salesSession}
        onAction={() => undefined}
      />
    </div>
  ),
};

export const Timeline: Story = {
  name: "TimelineItem — sổ công nợ đọc được",
  render: () => (
    <ul className="max-w-lg rounded-card border border-border bg-surface px-4">
      {accountTimeline.map((entry) => (
        <TimelineItem key={entry.id} entry={entry} actorName="Chị Hạnh (bán hàng)" />
      ))}
    </ul>
  ),
};

export const Shell: Story = {
  name: "WorkspaceShell — luôn thấy đang ghi vào vựa nào",
  parameters: { layout: "fullscreen" },
  render: () => (
    <WorkspaceShell workspaceName={WORKSPACE_NAME} session={salesSession}>
      <p className="text-body">Nội dung màn hình nằm ở đây.</p>
    </WorkspaceShell>
  ),
};

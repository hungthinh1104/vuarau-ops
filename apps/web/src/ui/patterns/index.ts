/**
 * Barrel for ui/patterns — kept for backward compatibility during migration.
 *
 * Prefer explicit sub-path imports at dependency sites:
 *   import { WorkspaceShell } from "@/ui/patterns/layout/workspace-shell.tsx";
 *   import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
 *   import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
 *   import { SaleLineEditor } from "@/ui/patterns/sale/sale-line-editor.tsx";
 *
 * Do not add new exports here; add them in the appropriate sub-folder index.
 */

// layout
export { AppNav } from "./layout/app-nav.tsx";
export { MobileNav } from "./layout/mobile-nav.tsx";
export { LinkButton, PageActions, PageHeader, Section } from "./layout/page-layout.tsx";
export { WorkspaceShell, type WorkspaceShellProps } from "./layout/workspace-shell.tsx";

// feedback
export { BusinessRejection, type BusinessRejectionProps } from "./feedback/business-rejection.tsx";
export { CommandOutcome } from "./feedback/command-outcome.tsx";
export {
  CommandProgressNotice,
  type CommandProgressNoticeProps,
} from "./feedback/command-progress-notice.tsx";
export { PermissionDenied, type PermissionDeniedProps } from "./feedback/permission-denied.tsx";
export { QueryStates } from "./feedback/query-states.tsx";
export {
  StaleVersionNotice,
  type StaleVersionNoticeProps,
} from "./feedback/stale-version-notice.tsx";
export {
  UnknownNetworkOutcome,
  type UnknownNetworkOutcomeProps,
} from "./feedback/unknown-network-outcome.tsx";

// finance
export { BalanceCard, type BalanceCardProps } from "./finance/balance-card.tsx";
export { BalancePreview } from "./finance/balance-preview.tsx";
export { MoneyImpact, type MoneyImpactProps } from "./finance/money-impact.tsx";

// sale
export { SaleStatus, type SaleStatusProps } from "./sale/sale-status.tsx";

// payment
export { PaymentStatus, type PaymentStatusProps } from "./payment/payment-status.tsx";

// shared root (no clear single domain)
export { CapabilityAction, type CapabilityActionProps } from "./capability-action.tsx";
export { TimelineItem, type TimelineItemProps } from "./timeline-item.tsx";
export {
  ConfirmationSummary,
  type ConfirmationLine,
  type ConfirmationSummaryProps,
} from "./confirmation-summary.tsx";

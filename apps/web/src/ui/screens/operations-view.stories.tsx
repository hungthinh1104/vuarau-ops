import type { Meta, StoryObj } from "@storybook/react-vite";
import type { WorkspaceIntegrityDto } from "@vuarau/domain-contracts";
import { WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { OperationsView } from "./operations-view.tsx";

const healthy: WorkspaceIntegrityDto = {
  workspaceId: WORKSPACE_ID,
  healthyCustomers: 32,
  anomalousCustomers: 0,
  missingSources: 0,
  duplicateSources: 0,
  projectionDrift: 0,
  healthySuppliers: 8,
  anomalousSuppliers: 0,
  anomalousInventoryKeys: 0,
  status: "healthy",
};

const baseArgs = {
  canManage: true,
  queuedCount: 0,
  blockedCount: 0,
  lastSuccessfulSync: "2026-08-01T12:30:00.000Z",
  integrityState: "ready" as const,
  integrity: healthy,
  exportLocked: false,
  exportCompleted: false,
  backupSelected: false,
  validation: null,
  validationPending: false,
  fileError: null,
  restoreReason: "",
  restoreLocked: false,
  restoreCompleted: false,
  onRetrySync: () => undefined,
  onRetryIntegrity: () => undefined,
  onExport: () => undefined,
  onResetExport: () => undefined,
  onBackupFileSelected: () => undefined,
  onRestoreReasonChange: () => undefined,
  onRestore: () => undefined,
};

const meta = {
  title: "Screens/Operations/Workspace",
  component: OperationsView,
  args: baseArgs,
} satisfies Meta<typeof OperationsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HealthyOwner: Story = {};
export const MobileOwner: Story = { globals: { viewport: { value: "mobile" } } };
export const IntegrityAttention: Story = {
  args: {
    integrity: {
      ...healthy,
      anomalousCustomers: 1,
      projectionDrift: 1,
      anomalousInventoryKeys: 2,
      status: "attention",
    },
  },
};
export const BlockedOfflineIntent: Story = {
  args: { queuedCount: 3, blockedCount: 1 },
};
export const IntegrityUnavailable: Story = {
  args: { integrityState: "error", integrity: null },
};
export const PermissionDenied: Story = { args: { canManage: false, integrity: null } };
export const ValidBackupReadyToRestore: Story = {
  args: {
    backupSelected: true,
    validation: { valid: true, diagnostics: [] },
    restoreReason: "Diễn tập phục hồi workspace trống",
  },
};
export const InvalidBackup: Story = {
  args: {
    backupSelected: true,
    validation: { valid: false, diagnostics: ["digest mismatch"] },
  },
};
export const UnknownExportOutcome: Story = {
  args: {
    exportLocked: true,
    exportOutcome: (
      <p role="status" className="text-body-sm text-warning">
        Chưa rõ máy chủ đã hoàn tất export. Resend cùng command identity trước khi tạo export mới.
      </p>
    ),
  },
};
export const ExportCompleted: Story = {
  args: {
    exportCompleted: true,
    exportOutcome: <p role="status">Bản sao lưu đã được tải xuống.</p>,
  },
};
export const RestoreCompleted: Story = {
  args: {
    backupSelected: true,
    validation: { valid: true, diagnostics: [] },
    restoreReason: "Diễn tập phục hồi workspace trống",
    restoreCompleted: true,
    restoreOutcome: <p role="status">Phục hồi hoàn tất; integrity đang được kiểm tra lại.</p>,
  },
};

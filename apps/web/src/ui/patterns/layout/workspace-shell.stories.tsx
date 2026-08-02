import type { Meta, StoryObj } from "@storybook/react-vite";
import { ownerSession, salesSession, WORKSPACE_NAME } from "@/fixtures/session.fixtures.ts";
import { WorkspaceShellView } from "./workspace-shell.tsx";

const meta = {
  title: "Patterns/Layout/Workspace shell",
  component: WorkspaceShellView,
  args: {
    workspaceName: WORKSPACE_NAME,
    session: salesSession,
    userLabel: "sales@example.com",
    pathname: "/today",
    children: (
      <section className="rounded-card border border-border bg-surface p-4">
        <h1 className="text-heading font-bold">Nội dung màn hình</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          Khung điều hướng giữ nguyên vị trí khi người dùng chuyển giữa các luồng vận hành.
        </p>
      </section>
    ),
  },
} satisfies Meta<typeof WorkspaceShellView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SalesDesktop: Story = {
  globals: { viewport: { value: "desktop" } },
};

export const SalesPhoneWithQueuedSync: Story = {
  globals: { viewport: { value: "mobile" } },
  args: {
    sync: {
      queuedCount: 2,
      blockedCount: 0,
      lastSuccessfulSync: null,
      onRetry: async () => undefined,
    },
  },
};

export const OwnerWithBlockedSync: Story = {
  args: {
    session: ownerSession,
    userLabel: "owner@example.com",
    pathname: "/workspace/operations",
    sync: {
      queuedCount: 0,
      blockedCount: 1,
      lastSuccessfulSync: "2026-08-02T08:15:00.000Z",
      onRetry: async () => undefined,
    },
    notice: "Có một lệnh cần người vận hành xử lý.",
  },
};

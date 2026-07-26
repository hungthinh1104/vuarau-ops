"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTRPC } from "./providers.tsx";
import { browserAccessToken } from "./access-token.ts";
import { domainErrorOf } from "./domain-error.ts";
import type { WorkspaceChoice } from "./session.ts";
import { configuredWorkspaces, storeWorkspaceId, storedWorkspaceId } from "./workspace.ts";
import { Button } from "../ui/primitives/button.tsx";
import { EmptyState } from "../ui/primitives/empty-state.tsx";
import { Skeleton } from "../ui/primitives/skeleton.tsx";
import { BusinessRejection } from "../ui/patterns/business-rejection.tsx";
import { WorkspaceShell } from "../ui/patterns/workspace-shell.tsx";

/**
 * What every production route sits behind: a verified identity, an explicitly
 * chosen depot, and the caller's permission set.
 *
 * The order is not arbitrary. Without a token there is nothing to ask; without a
 * workspace there is no question to ask; and `session.me` is the answer to both
 * "are you still a member" and "what may you do", which is why it is re-read
 * rather than cached across a workspace change. A membership revoked mid-shift
 * surfaces here on the next navigation.
 */
export type ActiveSession = {
  readonly session: SessionDto;
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string;
};

const SessionContext = createContext<ActiveSession | null>(null);

/** Throws rather than returning null: a route below the gate always has a session. */
export function useSession(): ActiveSession {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error("useSession() outside <SessionGate>. Every route sits behind the gate.");
  }
  return session;
}

export function SessionGate({ children }: { children: ReactNode }) {
  const choices = configuredWorkspaces(process.env["NEXT_PUBLIC_WORKSPACES"]);
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | null>(null);

  /*
   * The token and the chosen depot live in `sessionStorage`, which does not
   * exist on the server. Reading them during render makes the server's HTML and
   * the client's first render disagree, and React throws away the tree — visibly,
   * as a hydration error, and invisibly as a double render on every page load.
   *
   * So the first paint is deliberately "checking", for one frame, and everything
   * that depends on storage happens after mount.
   */
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(browserAccessToken());
    setWorkspaceId(storedWorkspaceId());
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Skeleton width="w-48" height="h-6" label="Đang mở phiên làm việc" />
      </main>
    );
  }

  if (token === null) {
    return <NotSignedIn />;
  }

  if (workspaceId === null || !choices.some((choice) => choice.workspaceId === workspaceId)) {
    // A stored id that is no longer configured — a changed deployment, a stale
    // tab — falls back to asking, never to picking a different depot.
    return (
      <WorkspacePicker
        choices={choices}
        onChoose={(chosen) => {
          storeWorkspaceId(chosen);
          setWorkspaceId(chosen);
        }}
      />
    );
  }

  return (
    <ResolveSession
      workspaceId={workspaceId}
      choices={choices}
      onChangeWorkspace={() => {
        storeWorkspaceId(null);
        setWorkspaceId(null);
      }}
    >
      {children}
    </ResolveSession>
  );
}

function ResolveSession({
  workspaceId,
  choices,
  onChangeWorkspace,
  children,
}: {
  workspaceId: WorkspaceId;
  choices: readonly WorkspaceChoice[];
  onChangeWorkspace: () => void;
  children: ReactNode;
}) {
  const trpc = useTRPC();
  const me = useQuery(trpc.session.me.queryOptions({ workspaceId }));
  const workspaceName =
    choices.find((choice) => choice.workspaceId === workspaceId)?.displayName ?? "Vựa";

  if (me.isPending) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Skeleton width="w-64" height="h-6" label="Đang kiểm tra quyền truy cập" />
      </main>
    );
  }

  if (me.isError) {
    const domainError = domainErrorOf(me.error);
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
        {domainError === null ? (
          <EmptyState
            title="Không kết nối được máy chủ"
            description="Kiểm tra mạng rồi thử lại. Chưa có gì được ghi."
            action={<Button onClick={() => void me.refetch()}>Thử lại</Button>}
          />
        ) : (
          // Covers membership_revoked, workspace access denied and an invalid
          // token alike: all of them mean this tab may not act, and all of them
          // are answered by a person rather than by a retry.
          <BusinessRejection
            error={domainError}
            action={
              <Button tone="secondary" onClick={onChangeWorkspace}>
                Chọn vựa khác
              </Button>
            }
          />
        )}
      </main>
    );
  }

  return (
    <SessionContext.Provider value={{ session: me.data, workspaceId, workspaceName }}>
      <WorkspaceShell workspaceName={workspaceName} session={me.data}>
        {children}
      </WorkspaceShell>
    </SessionContext.Provider>
  );
}

function NotSignedIn() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <EmptyState
        title="Chưa đăng nhập"
        description="Ứng dụng chưa có màn hình đăng nhập. Phiên đăng nhập do Supabase quản lý; xem apps/web/README.md để biết cách nạp phiên cho lần chạy thử."
      />
    </main>
  );
}

function WorkspacePicker({
  choices,
  onChoose,
}: {
  choices: readonly WorkspaceChoice[];
  onChoose: (workspaceId: WorkspaceId) => void;
}) {
  if (choices.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          title="Chưa cấu hình vựa nào"
          description="Đặt biến môi trường NEXT_PUBLIC_WORKSPACES theo dạng id:Tên vựa, cách nhau bằng dấu |."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <div>
        <h1 className="text-heading font-bold">Chọn vựa</h1>
        {/* Stated rather than implied. The consequence of the choice is which set
            of books every later action writes into. */}
        <p className="mt-1 text-body-sm text-ink-muted">
          Mọi đơn hàng và thanh toán sẽ được ghi vào vựa bạn chọn ở đây.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {choices.map((choice) => (
          <li key={choice.workspaceId}>
            <Button fullWidth tone="secondary" onClick={() => onChoose(choice.workspaceId)}>
              {choice.displayName}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}

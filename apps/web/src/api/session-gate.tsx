"use client";

import { useQuery } from "@tanstack/react-query";
import type { SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "./providers.tsx";
import { useAuth } from "./auth.tsx";
import { domainErrorOf } from "./domain-error.ts";
import type { WorkspaceChoice } from "./session.ts";
import { storeWorkspaceId, storedWorkspaceId } from "./workspace.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";
import { BusinessRejection } from "@/ui/patterns/feedback/business-rejection.tsx";
import { RequestCorrelation } from "@/ui/patterns/feedback/request-correlation.tsx";
import { SignInUnconfigured } from "@/ui/patterns/auth/sign-in.tsx";
import { ConnectedWorkspaceShell } from "@/ui/controllers/workspace-shell-controller.tsx";
import { OfflineProvider } from "@/offline/provider.tsx";
import {
  cacheSession,
  cacheWorkspaces,
  cachedSession,
  cachedWorkspaces,
} from "@/offline/session-cache.ts";
import { requestIdOf } from "@/lib/request-id.ts";
import { LiveInvalidation } from "./live-invalidation.tsx";

/**
 * What every production route sits behind: a verified identity, an explicitly
 * chosen depot, and the caller's permission set.
 *
 * The order is not arbitrary and each step needs the one before it:
 *
 *   1. Supabase says whether somebody is signed in.
 *   2. `session.workspaces` says which depots that person may act in.
 *   3. They choose one — always, never automatically.
 *   4. `session.me` says what they may do there, and re-checks membership.
 *
 * Step 2 used to be a build-time environment variable, which made the browser the
 * author of a claim only the server can make (BR-AUTH-008). Step 4 is re-read on a
 * workspace change rather than cached across it, so a membership revoked mid-shift
 * surfaces on the next navigation.
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

function Waiting({ label }: { label: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Skeleton width="w-64" height="h-6" label={label} />
    </main>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const subject = auth.status === "signed_in" ? auth.subject : null;
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | null>(null);

  /*
   * The chosen depot lives in `sessionStorage`, which does not exist on the
   * server. Reading it during render makes the server's HTML and the client's
   * first render disagree, and React throws away the tree — visibly, as a
   * hydration error, and invisibly as a double render on every page load.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (subject === null) {
      setWorkspaceId(null);
      setMounted(true);
      return;
    }
    setWorkspaceId(storedWorkspaceId(subject));
    setMounted(true);
  }, [subject]);

  useEffect(() => {
    if (mounted && auth.status === "signed_out") router.replace("/login");
  }, [auth.status, mounted, router]);

  if (!mounted || auth.status === "checking") {
    return <Waiting label="Đang mở phiên làm việc" />;
  }

  if (auth.status === "unconfigured") {
    return <SignInUnconfigured />;
  }

  if (auth.status === "signed_out") {
    return <Waiting label="Đang trở về đăng nhập" />;
  }

  return (
    <ChooseWorkspace
      workspaceId={workspaceId}
      onChoose={(chosen) => {
        storeWorkspaceId(auth.subject, chosen);
        setWorkspaceId(chosen);
      }}
      subject={auth.subject}
    >
      {children}
    </ChooseWorkspace>
  );
}

/**
 * Asks the server which depots this caller may work in, then makes them pick one.
 *
 * The list is a query like any other, so the ordinary failure paths apply: a
 * dropped connection offers a retry, and a refusal is shown as a refusal. What it
 * must never do is guess — including the tempting case of a single depot, which is
 * exactly the case where somebody with two would not notice the difference.
 */
function ChooseWorkspace({
  workspaceId,
  onChoose,
  children,
  subject,
}: {
  workspaceId: WorkspaceId | null;
  onChoose: (workspaceId: WorkspaceId | null) => void;
  children: ReactNode;
  subject: string;
}) {
  const auth = useAuth();
  const trpc = useTRPC();
  const workspaces = useQuery(trpc.session.workspaces.queryOptions({}));
  const [offlineWorkspaces] = useState(() => cachedWorkspaces(subject));
  useEffect(() => {
    if (workspaces.data !== undefined) cacheWorkspaces(subject, workspaces.data);
  }, [subject, workspaces.data]);

  if (workspaces.isPending && offlineWorkspaces === null) {
    return <Waiting label="Đang tải danh sách vựa" />;
  }

  const workspaceError = workspaces.isError ? domainErrorOf(workspaces.error) : null;
  const workspaceRequestId = workspaces.isError ? requestIdOf(workspaces.error) : null;
  if (workspaces.isError && (offlineWorkspaces === null || workspaceError !== null)) {
    const domainError = workspaceError;
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
        {domainError === null ? (
          <>
            <EmptyState
              title="Không kết nối được máy chủ"
              description="Kiểm tra mạng rồi thử lại. Chưa có gì được ghi."
              action={<Button onClick={() => void workspaces.refetch()}>Thử lại</Button>}
            />
            <RequestCorrelation requestId={workspaceRequestId} />
          </>
        ) : (
          <BusinessRejection
            error={domainError}
            requestId={workspaceRequestId}
            action={
              <Button tone="secondary" onClick={() => void auth.signOut()}>
                Đăng xuất
              </Button>
            }
          />
        )}
      </main>
    );
  }

  const choices = workspaces.data?.workspaces ?? offlineWorkspaces?.workspaces ?? [];
  const chosen = choices.find((choice) => choice.workspaceId === workspaceId) ?? null;

  if (chosen === null) {
    // A stored id that is no longer in the list — access revoked, a stale tab —
    // falls back to asking, never to picking a different depot.
    return <WorkspacePicker choices={choices} onChoose={onChoose} onSignOut={auth.signOut} />;
  }

  return (
    <ResolveSession choice={chosen} subject={subject} onChangeWorkspace={() => onChoose(null)}>
      {children}
    </ResolveSession>
  );
}

function ResolveSession({
  choice,
  onChangeWorkspace,
  children,
  subject,
}: {
  choice: WorkspaceChoice;
  onChangeWorkspace: () => void;
  children: ReactNode;
  subject: string;
}) {
  const auth = useAuth();
  const trpc = useTRPC();
  const workspaceId = choice.workspaceId;
  const me = useQuery(trpc.session.me.queryOptions({ workspaceId }));
  const [offlineSession] = useState(() => cachedSession(subject, workspaceId));
  useEffect(() => {
    if (me.data !== undefined) cacheSession(subject, workspaceId, me.data);
  }, [me.data, subject, workspaceId]);

  if (me.isPending && offlineSession === null) {
    return <Waiting label="Đang kiểm tra quyền truy cập" />;
  }

  const sessionError = me.isError ? domainErrorOf(me.error) : null;
  const sessionRequestId = me.isError ? requestIdOf(me.error) : null;
  if (me.isError && (offlineSession === null || sessionError !== null)) {
    const domainError = sessionError;
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
        {domainError === null ? (
          <>
            <EmptyState
              title="Không kết nối được máy chủ"
              description="Kiểm tra mạng rồi thử lại. Chưa có gì được ghi."
              action={<Button onClick={() => void me.refetch()}>Thử lại</Button>}
            />
            <RequestCorrelation requestId={sessionRequestId} />
          </>
        ) : (
          // Covers membership_revoked, workspace access denied and an invalid
          // token alike: all of them mean this tab may not act, and all of them
          // are answered by a person rather than by a retry.
          <BusinessRejection
            error={domainError}
            requestId={sessionRequestId}
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

  const session = me.data ?? offlineSession;
  if (session === null) return <Waiting label="Đang kiểm tra quyền truy cập" />;
  return (
    <SessionContext.Provider value={{ session, workspaceId, workspaceName: choice.name }}>
      <OfflineProvider session={session} workspaceId={workspaceId}>
        <LiveInvalidation workspaceId={workspaceId} />
        <ConnectedWorkspaceShell
          workspaceName={choice.name}
          session={session}
          userLabel={
            auth.status === "signed_in" && auth.email !== null
              ? auth.email
              : `Người dùng ${session.actorId.slice(0, 8)}`
          }
          onChangeWorkspace={onChangeWorkspace}
          onSignOut={auth.signOut}
        >
          {children}
        </ConnectedWorkspaceShell>
      </OfflineProvider>
    </SessionContext.Provider>
  );
}

export function WorkspacePicker({
  choices,
  onChoose,
  onSignOut,
}: {
  choices: readonly WorkspaceChoice[];
  onChoose: (workspaceId: WorkspaceId) => void;
  onSignOut?: () => void | Promise<void>;
}) {
  if (choices.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
        {/* Signed in and a member of nothing. A real state — the first minute of a
            new person's account — and the one most likely to be rendered as a
            spinner that never resolves. It names what to do about it. */}
        <EmptyState
          title="Tài khoản chưa được thêm vào vựa nào"
          description="Bạn đã đăng nhập, nhưng chưa được cấp quyền vào vựa nào. Báo chủ vựa để được thêm vào."
          {...(onSignOut !== undefined
            ? {
                action: (
                  <Button tone="secondary" onClick={() => void onSignOut()}>
                    Đăng xuất
                  </Button>
                ),
              }
            : {})}
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
              {choice.name}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}

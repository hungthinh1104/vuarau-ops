"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type WorkspaceChromeContextValue = {
  readonly actionDockCount: number;
  readonly registerActionDock: () => () => void;
};

const WorkspaceChromeContext = createContext<WorkspaceChromeContextValue | null>(null);

export function WorkspaceChromeProvider({ children }: { readonly children: ReactNode }) {
  const [actionDockCount, setActionDockCount] = useState(0);
  const registerActionDock = useCallback(() => {
    let active = true;
    setActionDockCount((count) => count + 1);
    return () => {
      if (!active) return;
      active = false;
      setActionDockCount((count) => Math.max(0, count - 1));
    };
  }, []);
  const value = useMemo(
    () => ({ actionDockCount, registerActionDock }),
    [actionDockCount, registerActionDock],
  );

  return (
    <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>
  );
}

export function useWorkspaceChrome(): WorkspaceChromeContextValue | null {
  return useContext(WorkspaceChromeContext);
}

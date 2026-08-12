"use client";

import { useSyncExternalStore } from "react";

export type LiveConnectionState = "live" | "syncing" | "reconnecting" | "stale";

let state: LiveConnectionState = "reconnecting";
const listeners = new Set<() => void>();

export function setLiveConnectionState(next: LiveConnectionState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

export function useLiveConnectionState(): LiveConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot, () => "reconnecting");
}

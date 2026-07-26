"use client";

import { useEffect, useState } from "react";

/**
 * Delays a value so a typed query is one request rather than one per keystroke.
 *
 * It matters more here than in most products: the target connection is 4G that
 * drops, and fourteen in-flight searches for "chị Lan chợ Bình" queue behind each
 * other so the last one — the only one that matters — arrives last.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}

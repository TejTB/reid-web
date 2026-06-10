"use client";
import { useSyncExternalStore } from "react";

// Hydration-safe client detection: false on the server snapshot, true on the
// client, with no setState-in-effect cascade. Use to gate any render branch
// that depends on browser-only capability detection (e.g. voice support),
// so the first client render always matches the server markup.

const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

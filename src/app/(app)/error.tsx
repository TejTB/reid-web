"use client";
// Route-segment error boundary for the (app) group.
//
// Per Next 16's error.js convention (`unstable_retry` replaces the older
// `reset` prop — see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/error.md), the boundary wraps every page under (app)
// — /home, /chat, /plan, /tasks. The AppShell (sidebar + bottom nav) is
// rendered by the (app)/layout.tsx, which sits ABOVE this boundary, so the
// nav chrome remains intact even when a page throws.
//
// The per-page inline error states defined on home/chat/plan/tasks catch
// expected data-load failures (Supabase reachability, etc.); this file
// catches anything that escapes — React render errors, unhandled rejections
// inside a non-`try` path, etc.
import { useEffect } from "react";

export default function AppSegmentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Server-side logs use `error.digest` to match; the client message is
    // typically generic in production. Keep this `console.error` — it is in
    // a catch and represents a genuine runtime failure worth surfacing.
    console.error(error);
  }, [error]);

  return (
    <div className="reid-radial min-h-screen flex flex-col items-center justify-center px-6 gap-4">
      <p className="font-serif italic text-text-dim text-lg [text-wrap:pretty]">
        Something went wrong.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="text-sm text-accent underline font-sans"
      >
        Try again
      </button>
    </div>
  );
}

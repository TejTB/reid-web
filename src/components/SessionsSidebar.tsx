"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatSessionDate } from "@/lib/format";

// Sprint 13 Build 2 — "what Reid knows": the desktop sidebar's session
// history. Lists summarised sessions (the API filters summary IS NOT NULL),
// newest first; click opens the read-only summary view at /sessions/[id].
// Desktop only this sprint (it renders inside AppShell's hidden-md:flex
// aside); the mobile entry is a deferred fast-follow.

interface SessionListItem {
  id: string;
  title: string | null;
  summary: string;
  started_at: string | null;
}

export default function SessionsSidebar() {
  const pathname = usePathname();
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch("/api/sessions/list", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) setSessions([]);
          return;
        }
        const body = (await res.json()) as { sessions?: SessionListItem[] };
        if (!cancelled) setSessions(body.sessions ?? []);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        padding: "12px 10px",
        borderTop: "1px solid rgba(242,237,232,0.06)",
      }}
    >
      <div
        style={{
          padding: "0 12px 8px",
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 11,
          color: "#7A90A8",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Sessions
      </div>
      {sessions === null ? null : sessions.length === 0 ? (
        <p
          style={{
            padding: "0 12px",
            fontFamily: "var(--font-sans), sans-serif",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#3A5070",
          }}
        >
          Reid hasn&apos;t written anything down yet.
        </p>
      ) : (
        <div
          style={{ maxHeight: 168, overflowY: "auto" }}
          className="flex flex-col"
        >
          {sessions.map((s) => {
            const href = `/sessions/${s.id}`;
            const active = pathname === href;
            const label = s.title?.trim() || formatSessionDate(s.started_at);
            return (
              <Link
                key={s.id}
                href={href}
                aria-current={active ? "page" : undefined}
                className="block rounded-md transition-colors"
                style={{
                  padding: "6px 12px",
                  fontFamily: "var(--font-sans), sans-serif",
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: active ? "#F2EDE3" : "#7A90A8",
                  background: active ? "rgba(255,255,255,0.04)" : "transparent",
                }}
              >
                {label || "Session"}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

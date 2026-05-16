"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle } from "lucide-react";
import { getUserId } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { relativeTime } from "@/lib/format";
import type { Conversation, User } from "@/types/db";

type Task = {
  id: string;
  text: string;
  createdAt: string;
};

// Pull every "Your task for tomorrow: …" snippet out of an assistant message.
// Tasks may appear mid-message (rare today, but defensive). Capture from the
// label to the next blank line OR the end of the message.
function extractTasksFromMessage(content: string): string[] {
  const out: string[] = [];
  const re = /your\s+task\s+for\s+tomorrow:\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    // Stop at a blank line (paragraph break) or end of string.
    const blank = rest.search(/\n\s*\n/);
    const slice = blank === -1 ? rest : rest.slice(0, blank);
    const cleaned = slice.trim();
    if (cleaned) out.push(cleaned);
  }
  return out;
}

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }

      // Pull the user (for onboarding_task seed) and all assistant messages
      // (to scan for labels) in parallel.
      const [userRes, convRes] = await Promise.all([
        supabase
          .from("users")
          .select(
            "id, email, name, onboarding_complete, onboarding_summary, onboarding_task, created_at",
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("conversations")
          .select("id, user_id, role, content, created_at")
          .eq("user_id", id)
          .eq("role", "assistant")
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      const user = userRes.data as User | null;
      const rows = (convRes.data ?? []) as Conversation[];

      const collected: Task[] = [];

      // Seed from users.onboarding_task. CreatedAt prefers the earliest
      // assistant message timestamp (closest to when the task was emitted),
      // falling back to the user's created_at.
      const seedTask = user?.onboarding_task?.trim();
      if (seedTask) {
        const seedAt =
          rows[0]?.created_at ?? user?.created_at ?? new Date().toISOString();
        collected.push({
          id: "onboarding",
          text: seedTask,
          createdAt: seedAt,
        });
      }

      // Scan every assistant message for "Your task for tomorrow:" labels.
      for (const row of rows) {
        const extracted = extractTasksFromMessage(row.content);
        for (let i = 0; i < extracted.length; i++) {
          collected.push({
            // Multiple labels in one message? Suffix the index so ids stay
            // unique (and per-task localStorage flags stay scoped).
            id: extracted.length === 1 ? row.id : `${row.id}:${i}`,
            text: extracted[i],
            createdAt: row.created_at,
          });
        }
      }

      // Dedupe by exact text — when users.onboarding_task agrees with a
      // labeled assistant message (the common case), keep the earlier one.
      const seen = new Set<string>();
      const deduped: Task[] = [];
      const sorted = [...collected].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      for (const t of sorted) {
        const key = t.text.trim();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(t);
      }

      // Hydrate done flags from localStorage.
      const map: Record<string, boolean> = {};
      try {
        for (const t of deduped) {
          map[t.id] = localStorage.getItem(`reid:task:${t.id}:done`) === "true";
        }
      } catch {
        // localStorage unavailable — assume all undone.
      }

      setTasks(deduped);
      setDoneMap(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggle(taskId: string) {
    setDoneMap((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      try {
        localStorage.setItem(
          `reid:task:${taskId}:done`,
          next[taskId] ? "true" : "false",
        );
      } catch {
        // ignore
      }
      return next;
    });
  }

  const doneCount = tasks.reduce((n, t) => (doneMap[t.id] ? n + 1 : n), 0);
  const remaining = tasks.length - doneCount;

  return (
    <div
      className="mx-auto w-full max-w-[680px] px-6 md:px-6"
      style={{ paddingTop: 56, paddingBottom: 40 }}
    >
      <header>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          Tasks
        </h1>
        <p
          className="font-sans"
          style={{
            color: "#7A90A8",
            fontSize: 15,
            marginTop: 8,
            marginBottom: 48,
          }}
        >
          What Reid has asked you to do.
        </p>
      </header>

      {!loaded ? (
        <div className="flex flex-col gap-3">
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 72, animationDelay: "0ms" }}
          />
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 72, animationDelay: "100ms" }}
          />
          <div
            className="rounded-[12px] bg-bg-card animate-skeleton"
            style={{ height: 72, animationDelay: "200ms" }}
          />
        </div>
      ) : tasks.length === 0 ? (
        <div
          className="flex flex-col items-center text-center animate-fade-up"
          style={{ paddingTop: 80 }}
        >
          <CheckCircle size={48} color="#3A5070" strokeWidth={1.4} />
          <h2
            className="font-serif italic"
            style={{
              fontSize: 24,
              color: "#7A90A8",
              marginTop: 20,
              fontWeight: 400,
            }}
          >
            No tasks yet.
          </h2>
          <p
            className="font-sans"
            style={{
              fontSize: 14,
              color: "#3A5070",
              marginTop: 8,
              maxWidth: 360,
              lineHeight: 1.6,
            }}
          >
            Reid will assign tasks at the end of your first conversation.
          </p>
        </div>
      ) : (
        <>
          <div className="flex" style={{ gap: 24, marginBottom: 32 }}>
            <Stat value={tasks.length} label="Total" color="#7A90A8" italic />
            <Stat
              value={doneCount}
              label="Done"
              color={doneCount > 0 ? "#22C55E" : "#7A90A8"}
            />
            <Stat
              value={remaining}
              label="Remaining"
              color={remaining > 0 ? "#B91C1C" : "#7A90A8"}
            />
          </div>

          <ul className="flex flex-col" style={{ gap: 12, listStyle: "none" }}>
            {tasks.map((t, i) => {
              const done = !!doneMap[t.id];
              return (
                <li
                  key={t.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div
                    className="flex items-start"
                    style={{
                      background: done
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(255,255,255,0.04)",
                      border: done
                        ? "1px solid rgba(255,255,255,0.04)"
                        : "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 12,
                      padding: "18px 22px",
                      gap: 16,
                      transition: "all 200ms ease",
                    }}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={done}
                      aria-label={
                        done ? "Mark task incomplete" : "Mark task complete"
                      }
                      onClick={() => toggle(t.id)}
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: done
                          ? "1.5px solid transparent"
                          : "1.5px solid rgba(255,255,255,0.2)",
                        background: done ? "#B91C1C" : "transparent",
                        cursor: "pointer",
                        transition: "all 200ms ease",
                        marginTop: 2,
                      }}
                    >
                      {done && (
                        <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-sans whitespace-pre-wrap"
                        style={{
                          fontSize: 15,
                          color: done ? "#7A90A8" : "#F2EDE3",
                          textDecoration: done ? "line-through" : "none",
                          transition:
                            "color 300ms ease, text-decoration-color 300ms ease",
                          lineHeight: 1.55,
                        }}
                      >
                        {t.text}
                      </p>
                      <p
                        className="font-sans"
                        style={{
                          fontSize: 12,
                          color: "#3A5070",
                          marginTop: 8,
                        }}
                      >
                        Assigned {relativeTime(t.createdAt)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  color,
  italic = false,
}: {
  value: number;
  label: string;
  color: string;
  italic?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="font-serif"
        style={{
          fontSize: 24,
          color,
          fontStyle: italic ? "italic" : "normal",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span
        className="font-sans"
        style={{ fontSize: 13, color: "#7A90A8", marginTop: 4 }}
      >
        {label}
      </span>
    </div>
  );
}

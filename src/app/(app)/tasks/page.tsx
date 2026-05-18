"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { GlowCard } from "@/components/ui/glow-card";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "Assigned May 16" — short, absolute, no clock time. Future tasks will get
// their own per-session dates; for now everything traces to the onboarding row.
function formatAssignedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

type Task = {
  /** Stable per-user index — 0 is the onboarding task. Future appended tasks
   *  would use 1, 2, … (foundation for sessions.task_set). */
  index: number;
  text: string;
  /** Human source label rendered below the task body. */
  source: string;
  /** "Assigned May 16" date stamp. */
  assignedDate: string;
};

const TOAST_DURATION_MS = 6000;

export default function TasksPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const userId = me?.id ?? null;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doneMap, setDoneMap] = useState<Record<number, boolean>>({});
  const [pendingMap, setPendingMap] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const error = false;

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    void (async () => {
      const collected: Task[] = [];
      const seedTask = me.onboarding_task?.trim();
      if (seedTask) {
        collected.push({
          index: 0,
          text: seedTask,
          source: "Session 1",
          assignedDate: formatAssignedDate(me.created_at),
        });
      }

      const map: Record<number, boolean> = {};
      // Server completion takes precedence over the local flag — the user
      // may have ticked from another device.
      const serverDone = !!me.onboarding_task_completed_at;
      for (const t of collected) {
        if (t.index === 0) {
          map[t.index] = serverDone;
        }
        try {
          if (!map[t.index]) {
            map[t.index] =
              localStorage.getItem(`reid:task:${me.id}:${t.index}:done`) ===
              "true";
          }
        } catch {
          // localStorage unavailable — assume current map value.
        }
      }

      if (cancelled) return;
      setTasks(collected);
      setDoneMap(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me, router]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast() {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      toastTimer.current = null;
    }, TOAST_DURATION_MS);
  }

  async function complete(task: Task) {
    if (!userId) return;
    if (doneMap[task.index]) return;
    if (pendingMap[task.index]) return;

    // Optimistic UI — fill the circle and strike the text immediately.
    setDoneMap((prev) => ({ ...prev, [task.index]: true }));
    setPendingMap((prev) => ({ ...prev, [task.index]: true }));
    try {
      localStorage.setItem(`reid:task:${userId}:${task.index}:done`, "true");
    } catch {
      // localStorage unavailable; the in-memory map still reflects done.
    }

    let session = null;
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      session = s;
    } catch {
      session = null;
    }

    let success = false;
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ taskText: task.text }),
      });
      success = res.ok;
    } catch {
      success = false;
    }

    setPendingMap((prev) => {
      const next = { ...prev };
      delete next[task.index];
      return next;
    });

    if (success) {
      showToast();
    }
  }

  const doneCount = tasks.reduce(
    (n, t) => (doneMap[t.index] ? n + 1 : n),
    0,
  );

  return (
    <div
      className="mx-auto w-full max-w-[680px] px-6 md:px-6"
      style={{ paddingTop: 56, paddingBottom: 40 }}
    >
      <header>
        <h1 className="font-serif text-3xl text-white mb-1">Tasks</h1>
        <p className="text-white/30 text-sm font-sans">
          What Reid has asked you to do.
        </p>
        {loaded && tasks.length > 0 && (
          <p
            className="font-sans text-right text-text-dim"
            style={{ fontSize: 12, marginTop: 12 }}
          >
            {tasks.length} task{tasks.length === 1 ? "" : "s"} · {doneCount} done
          </p>
        )}
      </header>

      <div style={{ marginTop: 32 }}>
        {error ? (
          <div className="flex flex-col items-center justify-center pt-24 gap-4">
            <p className="font-serif italic text-text-dim text-lg">
              Something went wrong.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-sm text-accent underline font-sans"
            >
              Try again
            </button>
          </div>
        ) : !loaded ? (
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
          <ul
            className="flex flex-col"
            style={{ gap: 12, listStyle: "none" }}
          >
            {tasks.map((t, i) => {
              const done = !!doneMap[t.index];
              return (
                <li
                  key={t.index}
                  className="animate-fade-up"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    opacity: done ? 0.6 : 1,
                  }}
                >
                  <GlowCard customSize glowColor="red" className="w-full">
                    <div className="bg-[#111111] rounded-xl">
                      <div
                        className="flex items-start"
                        style={{ padding: "18px 22px", gap: 16 }}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={done}
                          aria-label={
                            done ? "Task complete" : "Mark task complete"
                          }
                          onClick={() => complete(t)}
                          disabled={done}
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: done
                              ? "1.5px solid transparent"
                              : "1.5px solid rgba(255,255,255,0.2)",
                            background: done ? "#B91C1C" : "transparent",
                            cursor: done ? "default" : "pointer",
                            transition:
                              "background-color 200ms ease-out, border-color 200ms ease-out, opacity 200ms ease-out",
                            marginTop: 2,
                          }}
                        >
                          {done && (
                            <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-sans whitespace-pre-wrap [text-wrap:pretty]"
                            style={{
                              fontSize: 15,
                              color: "#F2EDE3",
                              textDecoration: done ? "line-through" : "none",
                              opacity: done ? 0.6 : 1,
                              transition:
                                "opacity 200ms ease-out, text-decoration-color 200ms ease-out",
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
                            Assigned {t.assignedDate}
                            {t.assignedDate ? "  ·  " : ""}
                            {t.source}
                          </p>
                        </div>
                      </div>
                    </div>
                  </GlowCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Toast: Reid responded. Bottom-right slide-in, surface bg, 6s
          auto-dismiss. Click navigates to /chat. */}
      <button
        type="button"
        onClick={() => {
          setToastVisible(false);
          router.push("/chat");
        }}
        aria-label="Open chat with Reid"
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          padding: "12px 16px",
          background: "#0F1E35",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12,
          color: "#F2EDE3",
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 14,
          letterSpacing: "0.01em",
          cursor: "pointer",
          opacity: toastVisible ? 1 : 0,
          transform: toastVisible
            ? "translateX(0)"
            : "translateX(calc(100% + 32px))",
          transition:
            "transform 220ms ease-out, opacity 220ms ease-out",
          pointerEvents: toastVisible ? "auto" : "none",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          zIndex: 60,
        }}
      >
        Reid responded →
      </button>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

function formatAssignedDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

type Task = {
  index: number;
  text: string;
  source: string;
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
  const [errorMap, setErrorMap] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // localStorage unavailable
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

    setDoneMap((prev) => ({ ...prev, [task.index]: true }));
    setPendingMap((prev) => ({ ...prev, [task.index]: true }));
    setErrorMap((prev) => {
      if (!prev[task.index]) return prev;
      const next = { ...prev };
      delete next[task.index];
      return next;
    });
    try {
      localStorage.setItem(`reid:task:${userId}:${task.index}:done`, "true");
    } catch {
      // localStorage unavailable
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
    } else {
      // Revert: clear local + in-memory flag, surface inline error.
      try {
        localStorage.removeItem(`reid:task:${userId}:${task.index}:done`);
      } catch {
        // ignore
      }
      setDoneMap((prev) => {
        const next = { ...prev };
        delete next[task.index];
        return next;
      });
      setErrorMap((prev) => ({ ...prev, [task.index]: true }));
    }
  }

  const doneCount = tasks.reduce(
    (n, t) => (doneMap[t.index] ? n + 1 : n),
    0,
  );
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto w-full max-w-[680px] px-6"
      style={{ paddingTop: 56, paddingBottom: 40 }}
    >
      <header>
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            marginBottom: 8,
          }}
        >
          Tasks
        </h1>
        <p
          className="font-sans"
          style={{ color: "#7A90A8", fontSize: 15 }}
        >
          What Reid has asked you to do.
        </p>
        {loaded && tasks.length > 0 && (
          <p
            className="font-sans text-right"
            style={{
              fontSize: 12,
              color: "#7A90A8",
              marginTop: 12,
              letterSpacing: "0.02em",
            }}
          >
            {tasks.length} task{tasks.length === 1 ? "" : "s"} · {doneCount} done
          </p>
        )}
      </header>

      <div style={{ marginTop: 32 }}>
        {!loaded ? (
          <div className="flex flex-col" style={{ gap: 12 }}>
            <div
              className="rounded-[14px] animate-skeleton"
              style={{
                height: 88,
                background: "rgba(255,255,255,0.04)",
                animationDelay: "0ms",
              }}
            />
            <div
              className="rounded-[14px] animate-skeleton"
              style={{
                height: 88,
                background: "rgba(255,255,255,0.04)",
                animationDelay: "100ms",
              }}
            />
          </div>
        ) : tasks.length === 0 ? (
          <div
            className="flex flex-col items-center text-center"
            style={{ paddingTop: 80, gap: 10 }}
          >
            <h2
              className="font-serif italic"
              style={{
                fontSize: 32,
                fontWeight: 400,
                color: "#F2EDE3",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              No tasks yet.
            </h2>
            <p
              className="font-sans"
              style={{
                fontSize: 15,
                color: "#7A90A8",
                lineHeight: 1.55,
                maxWidth: 360,
              }}
            >
              They come from your sessions with Reid.
            </p>
          </div>
        ) : allDone ? (
          <>
            <ul
              className="flex flex-col"
              style={{ gap: 12, listStyle: "none" }}
            >
              {tasks.map((t) => (
                <TaskItem
                  key={t.index}
                  task={t}
                  done
                  pending={false}
                  errored={false}
                  onComplete={() => {}}
                />
              ))}
            </ul>
            <div
              className="flex flex-col items-center text-center animate-fade-up"
              style={{ marginTop: 48, gap: 10 }}
            >
              <h2
                className="font-serif italic"
                style={{
                  fontSize: 28,
                  fontWeight: 400,
                  color: "#F2EDE3",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}
              >
                All done.
              </h2>
              <p
                className="font-sans"
                style={{
                  fontSize: 14,
                  color: "#7A90A8",
                  lineHeight: 1.55,
                  maxWidth: 360,
                }}
              >
                Reid will have more after your next session.
              </p>
            </div>
          </>
        ) : (
          <motion.ul
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.06 } },
            }}
            className="flex flex-col"
            style={{ gap: 12, listStyle: "none" }}
          >
            {tasks.map((t) => (
              <TaskItem
                key={t.index}
                task={t}
                done={!!doneMap[t.index]}
                pending={!!pendingMap[t.index]}
                errored={!!errorMap[t.index]}
                onComplete={() => complete(t)}
              />
            ))}
          </motion.ul>
        )}
      </div>

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
          background: "rgba(15,30,53,0.92)",
          border: "1px solid rgba(255,255,255,0.10)",
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
          transition: "transform 220ms ease-out, opacity 220ms ease-out",
          pointerEvents: toastVisible ? "auto" : "none",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          zIndex: 60,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        Reid responded →
      </button>
    </motion.div>
  );
}

function TaskItem({
  task,
  done,
  pending,
  errored,
  onComplete,
}: {
  task: Task;
  done: boolean;
  pending: boolean;
  errored: boolean;
  onComplete: () => void;
}) {
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.35 }}
      style={{ opacity: done ? 0.55 : 1 }}
    >
      <GlowCard customSize glowColor="red" className="w-full">
        <div style={{ borderRadius: 14 }}>
          <div
            className="flex items-start"
            style={{ padding: "18px 22px", gap: 16 }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? "Task complete" : "Mark task complete"}
              onClick={onComplete}
              disabled={done || pending}
              className="shrink-0 flex items-center justify-center relative"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: done
                  ? "1.5px solid transparent"
                  : "1.5px solid rgba(255,255,255,0.22)",
                background: done ? "#B91C1C" : "transparent",
                cursor: done || pending ? "default" : "pointer",
                transition:
                  "background-color 200ms ease-out, border-color 200ms ease-out",
                marginTop: 1,
              }}
            >
              <AnimatePresence>
                {done && (
                  <motion.svg
                    key="check"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <motion.path
                      d="M5 12.5L10 17.5L19 7.5"
                      stroke="#22C55E"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    />
                  </motion.svg>
                )}
              </AnimatePresence>
            </button>
            <div className="flex-1 min-w-0">
              <p
                className="font-sans whitespace-pre-wrap [text-wrap:pretty]"
                style={{
                  fontSize: 15,
                  color: "#F2EDE3",
                  textDecoration: done ? "line-through" : "none",
                  textDecorationColor: "rgba(242,237,227,0.45)",
                  opacity: done ? 0.6 : 1,
                  transition: "opacity 200ms ease-out",
                  lineHeight: 1.55,
                }}
              >
                {task.text}
              </p>
              <p
                className="font-sans"
                style={{
                  fontSize: 12,
                  color: "#3A5070",
                  marginTop: 8,
                  letterSpacing: "0.02em",
                }}
              >
                Assigned {task.assignedDate}
                {task.assignedDate ? "  ·  " : ""}
                {task.source}
              </p>
              {errored && (
                <p
                  className="font-sans"
                  style={{
                    fontSize: 13,
                    color: "#F87171",
                    marginTop: 8,
                  }}
                  role="alert"
                >
                  Didn&apos;t save. Try again.
                </p>
              )}
            </div>
          </div>
        </div>
      </GlowCard>
    </motion.li>
  );
}

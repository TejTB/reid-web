"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { GlowCard } from "@/components/ui/glow-card";
import {
  FullScreenCard,
  type FullScreenTaskData,
} from "@/components/ui/full-screen-card";

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** Unified task model used by the page. `source` distinguishes the legacy
 *  `users.onboarding_task` (origin === "onboarding") from real `public.tasks`
 *  rows (origin === "tasks"). The two flow through different complete
 *  endpoints; everything else above this layer is symmetric. */
type UnifiedTask = {
  id: string;
  origin: "onboarding" | "tasks";
  description: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  session_id: string | null;
};

type TaskRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  description: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

const TASK_SELECT =
  "id, user_id, session_id, description, due_date, completed, completed_at, created_at";

export default function TasksPage() {
  const router = useRouter();
  const { me, loading: authLoading } = useAuth();
  const userId = me?.id ?? null;
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [onboardingTaskComplete, setOnboardingTaskComplete] = useState<
    boolean | null
  >(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!userId) return [];
    const { data } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []) as TaskRow[];
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    void (async () => {
      const rows = await fetchTasks();
      if (cancelled) return;
      setTaskRows(rows);
      setOnboardingTaskComplete(!!me.onboarding_task_completed_at);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, me, router, fetchTasks]);

  const tasks = useMemo<UnifiedTask[]>(() => {
    const merged: UnifiedTask[] = [];
    if (me?.onboarding_task?.trim()) {
      merged.push({
        id: `onboarding:${me.id}`,
        origin: "onboarding",
        description: me.onboarding_task.trim(),
        due_date: null,
        completed: onboardingTaskComplete ?? false,
        completed_at: me.onboarding_task_completed_at ?? null,
        created_at: me.created_at,
        session_id: null,
      });
    }
    for (const r of taskRows) {
      merged.push({
        id: r.id,
        origin: "tasks",
        description: r.description,
        due_date: r.due_date,
        completed: r.completed,
        completed_at: r.completed_at,
        created_at: r.created_at,
        session_id: r.session_id,
      });
    }
    return merged.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [me, onboardingTaskComplete, taskRows]);

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  async function markTask(t: UnifiedTask, completed: boolean) {
    if (!userId) return;

    let accessToken: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    if (t.origin === "onboarding") {
      // Legacy path: completing the user's onboarding task. The URL parameter
      // is the user's own id — that's how /api/tasks/[id]/complete is wired.
      await fetch(`/api/tasks/${userId}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ completed }),
      });
      setOnboardingTaskComplete(completed);
    } else {
      await fetch(`/api/tasks/item/${t.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ completed }),
      });
      setTaskRows((prev) =>
        prev.map((r) =>
          r.id === t.id
            ? {
                ...r,
                completed,
                completed_at: completed ? new Date().toISOString() : null,
              }
            : r,
        ),
      );
    }
  }

  const activeContext = useMemo<
    | {
        type: "task";
        layoutId: string;
        data: FullScreenTaskData;
        onComplete?: () => Promise<void>;
        onUndo?: () => Promise<void>;
      }
    | null
  >(() => {
    if (!activeId) return null;
    const t = tasks.find((x) => x.id === activeId);
    if (!t) return null;
    return {
      type: "task",
      layoutId: `task-${t.id}`,
      data: {
        id: t.id,
        description: t.description,
        due_date: t.due_date,
        completed: t.completed,
        source: t.origin === "onboarding" ? "Session 1" : null,
      },
      onComplete: t.completed ? undefined : () => markTask(t, true),
      onUndo: () => markTask(t, false),
    };
    // markTask is stable enough — captures latest state via closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tasks]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto w-full max-w-[720px] px-6"
        style={{ paddingTop: 56, paddingBottom: 96 }}
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
        </header>

        <div style={{ marginTop: 32 }}>
          {!loaded ? (
            <div className="flex flex-col" style={{ gap: 12 }}>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-[14px] animate-skeleton"
                  style={{
                    height: 96,
                    background: "rgba(255,255,255,0.04)",
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
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
          ) : (
            <>
              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.06 } },
                }}
                className="flex flex-col"
                style={{ gap: 12, listStyle: "none", padding: 0, margin: 0 }}
              >
                {activeTasks.map((t) => (
                  <TaskListItem
                    key={t.id}
                    task={t}
                    onOpen={() => setActiveId(t.id)}
                  />
                ))}
              </motion.ul>
              {completedTasks.length > 0 && (
                <div style={{ marginTop: 36 }}>
                  <button
                    type="button"
                    onClick={() => setCompletedExpanded((v) => !v)}
                    className="font-sans uppercase tracking-widest flex items-center"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#7A90A8",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: 0,
                      gap: 6,
                    }}
                  >
                    Show completed ({completedTasks.length})
                    {completedExpanded ? (
                      <ChevronUp size={14} strokeWidth={2} />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2} />
                    )}
                  </button>
                  {completedExpanded && (
                    <motion.ul
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col"
                      style={{
                        gap: 12,
                        listStyle: "none",
                        padding: 0,
                        marginTop: 16,
                      }}
                    >
                      {completedTasks.map((t) => (
                        <TaskListItem
                          key={t.id}
                          task={t}
                          onOpen={() => setActiveId(t.id)}
                        />
                      ))}
                    </motion.ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      <FullScreenCard
        context={activeContext}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}

function TaskListItem({
  task,
  onOpen,
}: {
  task: UnifiedTask;
  onOpen: () => void;
}) {
  const due = task.due_date ? `Due ${formatDate(task.due_date)}` : null;
  return (
    <motion.li
      layoutId={`task-${task.id}`}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.35 }}
      onClick={onOpen}
      style={{ cursor: "pointer", opacity: task.completed ? 0.4 : 1 }}
    >
      <GlowCard customSize glowColor="red" className="w-full">
        <div
          style={{
            padding: "18px 22px",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p
            className="font-sans [text-wrap:pretty]"
            style={{
              fontSize: 15,
              color: "#F2EDE3",
              lineHeight: 1.55,
              margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textDecoration: task.completed ? "line-through" : "none",
              textDecorationColor: "rgba(242,237,227,0.45)",
            }}
          >
            {task.description}
          </p>
          {(due || task.completed) && (
            <p
              className="font-sans"
              style={{
                fontSize: 12,
                color: "#7A90A8",
                letterSpacing: "0.02em",
                margin: 0,
              }}
            >
              {task.completed ? "Done" : due}
            </p>
          )}
        </div>
      </GlowCard>
    </motion.li>
  );
}

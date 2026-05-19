"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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
          ) : tasks.length === 0 || activeTasks.length === 0 ? (
            <div
              className="flex flex-col items-center text-center"
              style={{ paddingTop: 80, gap: 10 }}
            >
              <p
                className="font-serif italic"
                style={{
                  fontSize: 22,
                  fontWeight: 400,
                  color: "#7A90A8",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.35,
                  maxWidth: 360,
                }}
              >
                Reid hasn&apos;t asked anything of you yet.
              </p>
              {completedTasks.length > 0 && (
                <p
                  className="font-sans"
                  style={{
                    fontSize: 13,
                    color: "#7A90A8",
                    lineHeight: 1.55,
                    maxWidth: 360,
                  }}
                >
                  {completedTasks.length === 1
                    ? "1 task completed."
                    : `${completedTasks.length} tasks completed.`}
                </p>
              )}
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
                <AnimatePresence initial={false}>
                  {activeTasks.map((t, i) => (
                    <TaskListItem
                      key={t.id}
                      task={t}
                      index={i}
                      isMostRecent={i === 0}
                      onOpen={() => setActiveId(t.id)}
                      onComplete={() => markTask(t, true)}
                    />
                  ))}
                </AnimatePresence>
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
                      {completedTasks.map((t, i) => (
                        <TaskListItem
                          key={t.id}
                          task={t}
                          index={i}
                          isMostRecent={false}
                          onOpen={() => setActiveId(t.id)}
                          onComplete={() => markTask(t, true)}
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

function isOverdue(task: UnifiedTask): boolean {
  if (task.completed || !task.due_date) return false;
  const due = new Date(task.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return dueDay.getTime() < today.getTime();
}

function TaskListItem({
  task,
  index,
  isMostRecent,
  onOpen,
  onComplete,
}: {
  task: UnifiedTask;
  index: number;
  isMostRecent: boolean;
  onOpen: () => void;
  onComplete: () => Promise<void> | void;
}) {
  const due = task.due_date ? `Due ${formatDate(task.due_date)}` : null;
  const overdue = isOverdue(task);
  // Optimistic local override. We only set this to `true` after a successful
  // click; the displayed "checked" state is `prop || override` so when the
  // parent eventually flips `task.completed`, we render that without ever
  // shadowing it with stale local state. Reset to false on every render
  // where the prop is already true (no useEffect needed).
  const [pending, setPending] = useState(false);
  const checked = task.completed || pending;

  const labelText = isMostRecent && !task.completed ? "TODAY'S TASK" : "TASK";

  async function handleCheckbox(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (checked) return;
    setPending(true);
    try {
      await onComplete();
    } catch {
      setPending(false);
    }
  }

  return (
    <motion.li
      layoutId={`task-${task.id}`}
      layout="position"
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0 },
      }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      onClick={onOpen}
      style={{
        cursor: "pointer",
        opacity: checked ? 0.5 : 1,
        transitionProperty: "opacity",
      }}
    >
      <GlowCard customSize glowColor="red" className="w-full">
        <div
          style={{
            padding: "16px 20px",
            borderRadius: 14,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            borderLeft: "3px solid rgba(185,28,28,0.4)",
          }}
        >
          {/* Circle checkbox */}
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? "Task complete" : "Mark task complete"}
            onClick={handleCheckbox}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                void handleCheckbox(e);
              }
            }}
            style={{
              flexShrink: 0,
              marginTop: 3,
              width: 20,
              height: 20,
              borderRadius: "50%",
              border: checked
                ? "1.5px solid #B91C1C"
                : "1.5px solid rgba(255,255,255,0.2)",
              background: checked ? "#B91C1C" : "transparent",
              cursor: checked ? "default" : "pointer",
              transition:
                "background-color 300ms ease, border-color 300ms ease",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked && (
              <motion.svg
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                width={10}
                height={10}
                viewBox="0 0 10 10"
                aria-hidden="true"
              >
                <path
                  d="M2 5.2 L4.2 7.4 L8 3"
                  fill="none"
                  stroke="#F2EDE3"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div
              className="flex items-center"
              style={{ gap: 10, marginBottom: 6 }}
            >
              <span
                className="font-sans"
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#B91C1C",
                }}
              >
                {labelText}
              </span>
              {overdue && (
                <span
                  className="font-sans"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#F2EDE3",
                    background: "rgba(185,28,28,0.18)",
                    border: "1px solid rgba(185,28,28,0.35)",
                    padding: "2px 7px",
                    borderRadius: 999,
                  }}
                >
                  Overdue
                </span>
              )}
            </div>
            <p
              className="font-serif italic [text-wrap:pretty]"
              style={{
                fontSize: 17,
                color: checked ? "#7A90A8" : "#F2EDE3",
                lineHeight: 1.6,
                margin: 0,
                textDecoration: checked ? "line-through" : "none",
                textDecorationColor: "rgba(122,144,168,0.6)",
                transition: "color 300ms ease",
              }}
            >
              {task.description}
            </p>
            {(due || checked) && (
              <p
                className="font-sans"
                style={{
                  fontSize: 12,
                  color: "#7A90A8",
                  letterSpacing: "0.02em",
                  marginTop: 8,
                  margin: 0,
                  paddingTop: 8,
                }}
              >
                {checked ? "Done" : due}
              </p>
            )}
          </div>
        </div>
      </GlowCard>
    </motion.li>
  );
}

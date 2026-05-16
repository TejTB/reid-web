"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle } from "lucide-react";
import { getUserId } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { User } from "@/types/db";

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

export default function TasksPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doneMap, setDoneMap] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  // True when the supabase load throws — surfaces the inline "Something
  // went wrong" fallback in place of the task list.
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }

      try {
        const { data, error: supaError } = await supabase
          .from("users")
          .select(
            "id, email, name, onboarding_complete, onboarding_summary, onboarding_task, created_at",
          )
          .eq("id", id)
          .maybeSingle();

        if (cancelled) return;
        if (supaError) {
          setError(true);
          setLoaded(true);
          return;
        }

        const user = data as User | null;
        const collected: Task[] = [];

        const seedTask = user?.onboarding_task?.trim();
        if (seedTask) {
          collected.push({
            index: 0,
            text: seedTask,
            source: "Session 1",
            assignedDate: formatAssignedDate(user?.created_at),
          });
        }

        // Hydrate done flags from localStorage. Keys are
        // `reid:task:{userId}:{index}:done` — matches /home so toggling on
        // either screen stays in sync.
        const map: Record<number, boolean> = {};
        try {
          for (const t of collected) {
            map[t.index] =
              localStorage.getItem(`reid:task:${id}:${t.index}:done`) === "true";
          }
        } catch {
          // localStorage unavailable — assume all undone.
        }

        setUserId(id);
        setTasks(collected);
        setDoneMap(map);
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setError(true);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggle(taskIndex: number) {
    if (!userId) return;
    setDoneMap((prev) => {
      const next = { ...prev, [taskIndex]: !prev[taskIndex] };
      try {
        localStorage.setItem(
          `reid:task:${userId}:${taskIndex}:done`,
          next[taskIndex] ? "true" : "false",
        );
      } catch {
        // ignore
      }
      return next;
    });
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
          }}
        >
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
                      onClick={() => toggle(t.index)}
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
                        className="font-sans whitespace-pre-wrap [text-wrap:pretty]"
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
                        Assigned {t.assignedDate}
                        {t.assignedDate ? "  ·  " : ""}
                        {t.source}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

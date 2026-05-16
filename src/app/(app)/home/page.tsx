"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { getUserId, getUser } from "@/lib/session";
import type { User } from "@/types/db";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type LoadedUser = Pick<
  User,
  "id" | "name" | "onboarding_complete" | "onboarding_summary" | "onboarding_task"
>;

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<LoadedUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [taskDone, setTaskDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        router.replace("/onboarding");
        return;
      }
      const u = await getUser(id);
      if (cancelled) return;
      if (!u || u.onboarding_complete === false) {
        router.replace("/onboarding");
        return;
      }
      setUser(u);
      // Load task-done flag for this user.
      try {
        const stored = localStorage.getItem(`reid:task:${id}:done`);
        setTaskDone(stored === "true");
      } catch {
        setTaskDone(false);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-6 pt-[60px] pb-12 flex flex-col gap-4">
        <div className="h-12 w-2/3 rounded-md bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
        <div className="h-32 rounded-2xl bg-bg-card animate-skeleton" />
      </div>
    );
  }

  const summary = user?.onboarding_summary?.trim() ?? "";
  const task = user?.onboarding_task?.trim() ?? "";
  const greetName = user?.name?.trim() || "there";

  function toggleTask() {
    if (!user) return;
    const next = !taskDone;
    setTaskDone(next);
    try {
      localStorage.setItem(`reid:task:${user.id}:done`, next ? "true" : "false");
    } catch {
      // localStorage unavailable; in-memory state still reflects the toggle.
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 md:px-6 pt-[60px] pb-12 flex flex-col">
      <div
        className="animate-fade-up"
        style={{ animationDelay: "0ms" }}
      >
        <h1
          className="font-serif text-text-primary text-[36px] md:text-[46px]"
          style={{
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          {greeting()}, {greetName}.
        </h1>
        <p
          className="font-sans"
          style={{
            color: "#7A90A8",
            fontSize: 16,
            fontWeight: 300,
            marginTop: 10,
          }}
        >
          Here&apos;s where things stand.
        </p>
      </div>

      <div className="flex flex-col gap-4" style={{ marginTop: 48 }}>
        <div
          className="animate-fade-up"
          style={{ animationDelay: "0ms" }}
        >
          <GlassCard title="YOUR FOCUS">
            {summary ? (
              <p className="font-serif italic text-text-primary text-[20px] leading-[1.55] whitespace-pre-wrap">
                {summary}
              </p>
            ) : (
              <p
                className="font-sans"
                style={{ fontSize: 15, color: "#7A90A8" }}
              >
                Complete your first conversation with Reid to see your focus.
              </p>
            )}
          </GlassCard>
        </div>

        <div
          className="animate-fade-up"
          style={{ animationDelay: "80ms" }}
        >
          <GlassCard title="TODAY'S TASK">
            {task ? (
              <div className="flex items-start" style={{ gap: 14 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={taskDone}
                  aria-label={taskDone ? "Mark task incomplete" : "Mark task complete"}
                  onClick={toggleTask}
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: taskDone
                      ? "1.5px solid transparent"
                      : "1.5px solid rgba(255,255,255,0.2)",
                    background: taskDone ? "#B91C1C" : "transparent",
                    cursor: "pointer",
                    transition: "all 200ms ease",
                    marginTop: 2,
                  }}
                >
                  {taskDone && (
                    <Check size={12} strokeWidth={2.5} color="#F2EDE3" />
                  )}
                </button>
                <p
                  className="font-sans"
                  style={{
                    fontSize: 16,
                    fontWeight: 400,
                    color: taskDone ? "#7A90A8" : "#F2EDE3",
                    textDecoration: taskDone ? "line-through" : "none",
                    transition:
                      "color 300ms ease, text-decoration-color 300ms ease",
                    lineHeight: 1.55,
                  }}
                >
                  {task}
                </p>
              </div>
            ) : (
              <p
                className="font-sans"
                style={{ fontSize: 15, color: "#7A90A8" }}
              >
                Reid will assign your first task in your next session.
              </p>
            )}
          </GlassCard>
        </div>

        <div
          className="animate-fade-up"
          style={{ animationDelay: "160ms" }}
        >
          <GlassCard title="CONTINUE">
            <p
              className="font-sans"
              style={{
                fontSize: 15,
                color: "#7A90A8",
                marginBottom: 20,
              }}
            >
              Your co-founder is ready.
            </p>
            <Link
              href="/chat"
              className="cta-shadow w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-text-primary transition-all duration-200 hover:-translate-y-px"
              style={{
                height: 46,
                borderRadius: 9,
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.04em",
              }}
            >
              <span>Open session</span>
              <ArrowRight size={16} strokeWidth={2} />
            </Link>
          </GlassCard>
        </div>
      </div>

    </div>
  );
}

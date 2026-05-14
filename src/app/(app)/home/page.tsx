"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { getUserId, getUser } from "@/lib/session";
import type { User } from "@/types/db";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

type LoadedUser = Pick<
  User,
  "id" | "name" | "onboarding_complete" | "onboarding_summary"
>;

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<LoadedUser | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const focusText =
    user?.onboarding_summary?.trim() ||
    "Reid hasn't framed your focus yet. Open a chat and tell him what's on your mind.";

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 pt-[60px] pb-12 flex flex-col gap-4">
      <div
        className="animate-fade-up"
        style={{ animationDelay: "0ms", marginBottom: 12 }}
      >
        <h1
          className="font-serif text-text-primary"
          style={{
            fontSize: 42,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          {greeting()}
          {user?.name ? `, ${user.name}` : ""}.
        </h1>
        <p
          className="font-sans"
          style={{
            color: "#7A90A8",
            fontSize: 16,
            fontWeight: 300,
            marginTop: 8,
          }}
        >
          Here&apos;s where you are.
        </p>
      </div>

      <div
        className="animate-fade-up"
        style={{ animationDelay: "100ms" }}
      >
        <GlassCard title="YOUR CURRENT FOCUS">
          <p className="font-serif italic text-text-primary text-[20px] leading-[1.55] whitespace-pre-wrap">
            {focusText}
          </p>
        </GlassCard>
      </div>

      <div
        className="animate-fade-up"
        style={{ animationDelay: "200ms" }}
      >
        <GlassCard title="TODAY'S TASK">
          <p className="font-serif italic text-text-primary text-[20px] leading-[1.55]">
            Reid will assign your first task in your next session.
          </p>
        </GlassCard>
      </div>

      <div
        className="animate-fade-up"
        style={{ animationDelay: "300ms" }}
      >
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
          <span>Talk to Reid</span>
          <ArrowRight size={16} strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

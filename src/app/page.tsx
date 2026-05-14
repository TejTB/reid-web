"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import { getUserId, getUser } from "@/lib/session";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = getUserId();
      if (!id) {
        if (!cancelled) router.replace("/onboarding");
        return;
      }
      const user = await getUser(id);
      if (cancelled) return;
      if (!user || user.onboarding_complete === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/home");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center gap-8">
      <LogoMark size={56} />
      <div className="h-px w-32 bg-text-dim/40 animate-pulse" />
    </div>
  );
}

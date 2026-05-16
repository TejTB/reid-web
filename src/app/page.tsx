"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import { getUserId, isOnboarded } from "@/lib/session";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Synchronous-only redirect gate. localStorage is the source of truth for
    // "this device finished onboarding" — we do not wait on Supabase here,
    // because the network round-trip was the source of the redirect loop.
    const userId = getUserId();
    const onboarded = isOnboarded();
    if (onboarded && userId) {
      router.replace("/home");
    } else {
      router.replace("/onboarding");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center gap-8">
      <LogoMark size={56} />
      <div className="h-px w-32 bg-text-dim/40 animate-pulse" />
    </div>
  );
}

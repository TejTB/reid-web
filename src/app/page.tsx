"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LogoMark from "@/components/LogoMark";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // Synchronous localStorage-only redirect gate. NO Supabase — the network
    // round-trip was the source of past redirect loops. localStorage is the
    // source of truth for "this device finished onboarding".
    const userId = localStorage.getItem("reid:userId");
    const onboarded = localStorage.getItem("reid:onboarded") === "true";
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

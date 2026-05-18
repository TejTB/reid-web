"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { supabase } from "@/lib/supabase";
import { updatePassword, validatePassword } from "@/lib/session";

function ResetInner() {
  const router = useRouter();
  const search = useSearchParams();
  const code = search.get("code");
  const [exchanging, setExchanging] = useState(true);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (code) {
        const { error: ex } = await supabase.auth.exchangeCodeForSession(
          code,
        );
        if (cancelled) return;
        if (!ex) {
          setExchanging(false);
          return;
        }
        // Code may have already been exchanged (refresh / back-button).
        // Fall through to getSession to check for an existing recovery session.
      }
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        if (!data.session) {
          setExchangeError(
            "This reset link is invalid or expired. Request a new one.",
          );
        }
        setExchanging(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/home");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <LogoMark />
        </div>
        <h1 className="text-2xl font-serif text-center mb-6">
          Set a new password
        </h1>
        {exchanging ? (
          <p className="text-center text-sm text-neutral-400">Loading…</p>
        ) : exchangeError ? (
          <>
            <p
              role="alert"
              className="text-center text-sm text-red-400 mb-4"
            >
              {exchangeError}
            </p>
            <p className="text-center text-sm text-neutral-400">
              <Link
                href="/forgot-password"
                className="text-white underline"
              >
                Request a new link
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="New password (12+ chars, upper, digit)"
              autoComplete="new-password"
              minLength={12}
              required
              disabled={submitting}
              className="w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 text-white"
            />
            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-500 disabled:bg-red-900 text-white py-2 rounded"
            >
              {submitting ? "Updating…" : "Update password →"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-black" aria-hidden />}
    >
      <ResetInner />
    </Suspense>
  );
}

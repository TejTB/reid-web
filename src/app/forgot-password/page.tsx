"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { requestPasswordReset, validateEmail } from "@/lib/session";

function ForgotInner() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    setSubmitting(true);
    await requestPasswordReset(email);
    setSubmitting(false);
    setSent(true);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <LogoMark />
        </div>
        {sent ? (
          <>
            <h1 className="text-2xl font-serif text-center mb-3">
              Check your email
            </h1>
            <p className="text-center text-sm text-neutral-400">
              If that email is registered, you&apos;ll receive a reset link
              shortly.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-serif text-center mb-6">
              Reset your password
            </h1>
            <form
              onSubmit={handleSubmit}
              noValidate
              className="space-y-4"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
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
                {submitting ? "Sending…" : "Send reset link →"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-neutral-400">
              <Link href="/login" className="hover:text-white">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-black" aria-hidden />}
    >
      <ForgotInner />
    </Suspense>
  );
}

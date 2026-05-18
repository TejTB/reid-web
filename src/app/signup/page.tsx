"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import {
  signUpWithPassword,
  validateEmail,
  validatePassword,
} from "@/lib/session";

function SignupInner() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setSubmitting(true);
    const { error: err } = await signUpWithPassword(email, password);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
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
              We sent a confirmation link to {email}. Click it to finish
              creating your account.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-serif text-center mb-6">
              Create your account
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (12+ chars, upper, digit)"
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
                {submitting ? "Creating…" : "Create account →"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-neutral-400">
              Already have an account?{" "}
              <Link href="/login" className="text-white underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-black" aria-hidden />}
    >
      <SignupInner />
    </Suspense>
  );
}

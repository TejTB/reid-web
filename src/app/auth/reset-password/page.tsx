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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
          setExchangeError("That link's dead. Get a fresh one.");
        }
        setExchanging(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    const pwErr = validatePassword(password);
    if (pwErr) {
      setErrorMsg(pwErr);
      return;
    }
    setSubmitting(true);
    const { error: err } = await updatePassword(password);
    setSubmitting(false);
    if (err) {
      setErrorMsg(err.message);
      return;
    }
    // Send to root — the server-side `/` resolver inspects users.onboarding_complete
    // and routes to /home or /onboarding accordingly. Hard-coding /home would
    // bounce mid-onboarding users back to onboarding via the proxy.
    router.replace("/");
  }

  const disabled = submitting || !password;

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center px-6">
      <div
        className="w-full flex flex-col items-center"
        style={{ maxWidth: 360 }}
      >
        <div className="auth-mark">
          <LogoMark size={48} />
        </div>

        <h1
          className="font-serif italic text-text-primary text-center auth-title"
          style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginTop: 22,
          }}
        >
          New password. Make it count.
        </h1>

        <div
          className="w-full flex flex-col items-center auth-body"
          style={{ marginTop: 22 }}
        >
          {exchanging ? (
            <p
              className="font-sans text-center"
              style={{
                fontSize: 14,
                color: "#7A90A8",
                lineHeight: 1.6,
                maxWidth: 340,
              }}
            >
              One moment.
            </p>
          ) : exchangeError ? (
            <div
              className="w-full flex flex-col items-center auth-fade-in"
              style={{ maxWidth: 340, gap: 18 }}
            >
              <p
                role="alert"
                className="font-sans text-center"
                style={{
                  fontSize: 14,
                  color: "#F87171",
                  lineHeight: 1.6,
                  maxWidth: 340,
                  margin: 0,
                }}
              >
                {exchangeError}
              </p>
              <Link
                href="/forgot-password"
                className="cta-shadow flex items-center justify-center font-sans text-text-primary"
                style={{
                  height: 48,
                  padding: "0 28px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  background: "#B91C1C",
                  textDecoration: "none",
                }}
              >
                Get a new one
              </Link>
            </div>
          ) : (
            <div
              className="w-full flex flex-col items-center auth-fade-in"
              style={{ maxWidth: 340, gap: 18 }}
            >
              <form
                onSubmit={handleSubmit}
                noValidate
                className="w-full flex flex-col"
                style={{ gap: 12 }}
              >
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  autoFocus
                  minLength={12}
                  readOnly={submitting}
                  value={password}
                  onChange={(e) => {
                    setPasswordValue(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="New password (12+ chars, upper, digit)"
                  className="font-sans auth-input"
                  style={{
                    background: "transparent",
                    borderRadius: 9,
                    padding: "0 14px",
                    height: 48,
                    fontSize: 15,
                    color: "#F2EDE3",
                    outline: "none",
                    width: "100%",
                  }}
                />
                {errorMsg && (
                  <p
                    role="alert"
                    className="font-sans"
                    style={{
                      fontSize: 13,
                      color: "#F87171",
                      margin: 0,
                    }}
                  >
                    {errorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={disabled}
                  className="cta-shadow flex items-center justify-center font-sans text-text-primary"
                  style={{
                    height: 48,
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    background: "#B91C1C",
                    border: "none",
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    transition: "opacity 200ms ease, transform 200ms ease",
                    width: "100%",
                  }}
                >
                  <span className={submitting ? "auth-pulse" : undefined}>
                    {submitting ? "Saving…" : "Lock it in →"}
                  </span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes auth-mark-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes auth-title-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes auth-body-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes auth-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes auth-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .auth-mark {
          opacity: 0;
          animation: auth-mark-in 500ms ease-out both;
        }
        .auth-title {
          opacity: 0;
          animation: auth-title-in 300ms ease-out 400ms both;
        }
        .auth-body {
          opacity: 0;
          animation: auth-body-in 400ms ease-out 700ms both;
        }
        .auth-fade-in {
          animation: auth-fade-in 200ms ease-out both;
        }
        .auth-pulse {
          animation: auth-pulse 1500ms ease-in-out infinite;
        }
        .auth-input {
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .auth-input:focus,
        .auth-input:focus-visible {
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.15);
          outline: none;
        }
      `}</style>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-bg-dark" aria-hidden />}
    >
      <ResetInner />
    </Suspense>
  );
}

"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { useAuth } from "@/components/AuthProvider";
import {
  signInWithPassword,
  validateEmail,
  validatePassword,
} from "@/lib/session";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) {
      router.replace(next && next.startsWith("/") ? next : "/home");
    }
  }, [loading, session, next, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setErrorMsg(pwErr);
      return;
    }
    setSubmitting(true);
    const { error } = await signInWithPassword(email, password);
    setSubmitting(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    router.replace(next && next.startsWith("/") ? next : "/home");
  }

  const disabled = submitting || !email.trim() || !password;

  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center px-6">
      <div
        className="w-full flex flex-col items-center"
        style={{ maxWidth: 360 }}
      >
        {/* Logomark — fades in over 500ms */}
        <div className="login-mark">
          <LogoMark size={48} />
        </div>

        {/* Title — fades in after 500ms */}
        <h1
          className="font-serif italic text-text-primary text-center login-title"
          style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            marginTop: 20,
          }}
        >
          Welcome back.
        </h1>

        {/* Body + form + footer — fade up together after 800ms */}
        <div
          className="w-full flex flex-col items-center login-body"
          style={{ marginTop: 22 }}
        >
          <div
            className="w-full flex flex-col items-center login-fade-in"
            style={{ maxWidth: 340, gap: 18 }}
          >
            {/* Body copy */}
            <p
              className="font-sans text-center"
              style={{
                fontSize: 14,
                color: "#7A90A8",
                lineHeight: 1.6,
                maxWidth: 340,
              }}
            >
              Reid&apos;s been keeping notes.
            </p>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              noValidate
              className="w-full flex flex-col"
              style={{ gap: 12 }}
            >
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                readOnly={submitting}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Email"
                className="font-sans login-input"
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
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                minLength={12}
                readOnly={submitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Password"
                className="font-sans login-input"
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
                  className="font-sans login-error"
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
                <span className={submitting ? "login-pulse" : undefined}>
                  {submitting ? "Signing in…" : "Continue →"}
                </span>
              </button>
            </form>

            {/* Footer copy */}
            <div
              className="w-full flex flex-col items-center font-sans"
              style={{
                fontSize: 12,
                color: "#7A90A8",
                lineHeight: 1.6,
                maxWidth: 340,
                gap: 8,
              }}
            >
              <p style={{ margin: 0 }}>
                No account?{" "}
                <Link
                  href="/signup"
                  style={{ color: "#C8D5E3", textDecoration: "underline" }}
                >
                  Start here →
                </Link>
              </p>
              <Link
                href="/forgot-password"
                style={{ color: "#7A90A8" }}
                className="hover:text-white"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes login-mark-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes login-title-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes login-body-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes login-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes login-error-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes login-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .login-mark {
          opacity: 0;
          animation: login-mark-in 500ms ease-out both;
        }
        .login-title {
          opacity: 0;
          animation: login-title-in 300ms ease-out 500ms both;
        }
        .login-body {
          opacity: 0;
          animation: login-body-in 400ms ease-out 800ms both;
        }
        .login-fade-in {
          animation: login-fade-in 200ms ease-out both;
        }
        .login-error {
          animation: login-error-in 200ms ease-out both;
        }
        .login-pulse {
          animation: login-pulse 1500ms ease-in-out infinite;
        }
        .login-input {
          border: 1px solid rgba(255, 255, 255, 0.1);
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .login-input:focus,
        .login-input:focus-visible {
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.15);
          outline: none;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg-dark flex items-center justify-center">
          <LogoMark size={48} />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

"use client";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import {
  signUpWithPassword,
  validateEmail,
  validatePassword,
} from "@/lib/session";

function SignupInner() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg("Reid needs to know what to call you.");
      return;
    }
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
    const { error: err } = await signUpWithPassword(email, password, name);
    if (err) {
      setSubmitting(false);
      setErrorMsg(err.message);
      return;
    }
    router.replace("/onboarding");
  }

  const disabled = submitting || !name.trim() || !email.trim() || !password;

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
          Before we start.
        </h1>

        <div
          className="w-full flex flex-col items-center auth-body"
          style={{ marginTop: 22 }}
        >
          <div
            className="w-full flex flex-col items-center auth-fade-in"
            style={{ maxWidth: 340, gap: 18 }}
          >
            <p
              className="font-sans text-center"
              style={{
                fontSize: 14,
                color: "#7A90A8",
                lineHeight: 1.6,
                maxWidth: 340,
              }}
            >
              Two minutes. Then we talk.
            </p>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="w-full flex flex-col"
              style={{ gap: 12 }}
            >
              <input
                id="name"
                type="text"
                required
                autoComplete="given-name"
                autoFocus
                readOnly={submitting}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Your name"
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
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                readOnly={submitting}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Email"
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
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                readOnly={submitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Password (12+ chars, upper, digit)"
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
                  {submitting ? "Setting up…" : "Begin →"}
                </span>
              </button>
            </form>

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
                Been here before?{" "}
                <Link
                  href="/login"
                  style={{ color: "#C8D5E3", textDecoration: "underline" }}
                >
                  Sign in →
                </Link>
              </p>
            </div>
          </div>
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

export default function SignupPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-bg-dark" aria-hidden />}
    >
      <SignupInner />
    </Suspense>
  );
}

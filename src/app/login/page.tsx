"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LogoMark from "@/components/LogoMark";
import { useAuth } from "@/components/AuthProvider";
import { signInWithMagicLink } from "@/lib/session";
import { Checkbox } from "@/components/ui/checkbox";

// Map raw Supabase error messages to Reid-voiced one-liners. Anything we
// don't explicitly recognise falls through to the generic copy and gets
// logged so we can see the real shape during dev.
function reidErrorFor(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("rate limit") ||
    m.includes("over_email_send_rate_limit") ||
    m.includes("429") ||
    m.includes("too many")
  ) {
    return "Too many tries. Wait a minute, then try again.";
  }
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid email") ||
    m.includes("invalid_email")
  ) {
    return "That email doesn't look right.";
  }
  return "Couldn't send the link. Try again.";
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Soft requirement for the public launch — we display the acceptance and
  // capture it client-side, but the form is not blocked on the checkbox.
  // Email-based auth means new users will see this on every sign-in attempt
  // and we'd rather have them in the funnel than fight a checkbox.
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      router.replace(next && next.startsWith("/") ? next : "/home");
    }
  }, [loading, session, next, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!value) return;
    setSubmitting(true);
    setErrorMsg(null);
    const { error } = await signInWithMagicLink(value, next);
    setSubmitting(false);
    if (error) {
      // Log the raw message so we can refine the mapping later; the user
      // only ever sees the Reid-voiced version.
      console.error("[login] signInWithMagicLink error:", error.message);
      setErrorMsg(reidErrorFor(error.message));
      return;
    }
    setSentEmail(value);
    setSent(true);
  }

  const disabled = submitting || !email.trim();

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
          className="font-serif text-text-primary text-center login-title"
          style={{
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            marginTop: 20,
          }}
        >
          Reid
        </h1>

        {/* Body + form + footer — fade up together after 800ms */}
        <div
          className="w-full flex flex-col items-center login-body"
          style={{ marginTop: 22 }}
        >
          {sent ? (
            <div
              key="sent"
              className="w-full flex flex-col items-center login-fade-in"
              style={{ maxWidth: 340, gap: 14, textAlign: "center" }}
            >
              <p
                className="font-serif italic text-text-primary"
                style={{ fontSize: 22, lineHeight: 1.4 }}
              >
                Check your email.
              </p>
              <p
                className="font-sans"
                style={{
                  fontSize: 14,
                  color: "#7A90A8",
                  lineHeight: 1.6,
                }}
              >
                We sent a link to{" "}
                <span style={{ color: "#C8D5E3" }}>{sentEmail}</span>. Open it
                from this device and you&apos;re in.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setErrorMsg(null);
                }}
                className="font-sans"
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: "#7A90A8",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div
              key="form"
              className="w-full flex flex-col items-center login-fade-in"
              style={{ maxWidth: 340, gap: 18 }}
            >
              {/* Body copy */}
              <p
                className="font-serif italic text-text-primary text-center"
                style={{
                  fontSize: 18,
                  lineHeight: 1.5,
                  maxWidth: 340,
                }}
              >
                Enter your email.
                <br />
                We&apos;ll send you a link.
              </p>

              {/* Form */}
              <form
                onSubmit={handleSubmit}
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
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    checked={agreedToTerms}
                    onCheckedChange={(v) => setAgreedToTerms(v === true)}
                    aria-label="I agree to the Terms and Privacy Policy"
                  />
                  <span className="text-white/40 text-xs font-sans leading-relaxed text-left">
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-white underline transition-colors"
                    >
                      Terms
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-white underline transition-colors"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={disabled}
                  className="cta-shadow flex items-center justify-center font-sans text-text-primary"
                  style={{
                    height: 46,
                    borderRadius: 9,
                    fontSize: 13,
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
                    {submitting ? "Sending…" : "Send link →"}
                  </span>
                </button>
              </form>

              {/* Divider */}
              <div
                className="w-full flex items-center"
                style={{ gap: 10, maxWidth: 340 }}
              >
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "rgba(58,80,112,0.5)",
                  }}
                />
                <span
                  className="font-sans"
                  style={{
                    fontSize: 12,
                    color: "#3A5070",
                    letterSpacing: "0.04em",
                  }}
                >
                  or
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "rgba(58,80,112,0.5)",
                  }}
                />
              </div>

              {/* Footer copy */}
              <p
                className="font-sans text-center"
                style={{
                  fontSize: 12,
                  color: "#7A90A8",
                  lineHeight: 1.6,
                  maxWidth: 340,
                  margin: 0,
                }}
              >
                New here? Same link. Your first session is free.
              </p>
            </div>
          )}
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
          border: 1px solid transparent;
          transition: border-color 200ms ease;
        }
        .login-input:focus,
        .login-input:focus-visible {
          border: 1px solid #b91c1c;
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

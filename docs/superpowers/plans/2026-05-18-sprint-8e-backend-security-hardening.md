# Sprint 8E — Backend Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 2 CRITICAL exploits (self-promotion to Pro, SECURITY DEFINER fns), replace magic-link with email+password, add security headers, add login + per-minute rate limits, sanitise the remaining API error leak, and harden Supabase RLS — then preview-deploy, verify, and ship to prod.

**Architecture:** Augment the existing `src/proxy.ts` (Next.js 16 renamed middleware → proxy) rather than create `middleware.ts`. Keep `/auth/callback` for email-confirmation + recovery code exchange. Move password login through a new `/api/auth/login` server route so the limiter runs server-side. Apply RLS lockdown via Supabase migrations (auditable history). All commits land on `main`; rollback is `vercel rollback`.

**Tech Stack:** Next.js 16.2.6 (App Router), Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Upstash Redis (Vercel KV), Anthropic SDK, Stripe, ElevenLabs, Resend. Node 24 LTS. Source spec: `docs/superpowers/specs/2026-05-18-sprint-8e-backend-security-hardening-design.md`.

---

## File Inventory

**Modify:**
- `src/proxy.ts` — public paths, onboarding guard
- `next.config.ts` — security headers, `poweredByHeader: false`, `images.remotePatterns`
- `src/lib/session.ts` — drop magic-link; add password fns + validators
- `src/lib/ratelimit.ts` — add login + per-minute limiters
- `src/app/login/page.tsx` — sign-in only, generic errors
- `src/app/api/reid/route.ts` — per-minute limit, Zod max 4000
- `src/app/api/observe/route.ts` — sanitise error
- `src/app/api/push/subscribe-native/route.ts` — Zod schema
- `src/app/api/notifications/trigger/route.ts` — timing-safe Bearer
- `src/app/cron/reengage/route.ts` — timing-safe Bearer

**Create:**
- `src/app/signup/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/auth/reset-password/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/lib/__tests__/validators.test.ts` (run with `node --test`)

**Migrate (Supabase):**
- `lock_billing_columns_authenticated_anon`
- `revoke_security_definer_public_exec`
- `drop_dead_handle_new_user`
- `tighten_waitlist_anon_insert`
- `wrap_auth_uid_in_select_users_policies`

**Conditionally delete:**
- `src/app/auth/error/page.tsx` — only if grep confirms no remaining links after Task 3

**One-time SQL (pre-deploy, not a migration):**
- `DELETE FROM auth.users` to wipe pre-launch users.

---

## Task 0: Capture baseline POC

**Files:**
- Read-only verification — no code changes.

- [ ] **Step 0.1: Confirm the C1 exploit currently works (read-only)**

Run via Supabase MCP `execute_sql` against project `wzmoeutpxndeqgfsnfci`:
```sql
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users'
  AND grantee='authenticated'
  AND column_name IN ('subscription_status','stripe_customer_id','subscription_period_end')
  AND privilege_type='UPDATE'
ORDER BY column_name;
```
Expected: three rows, one per billing column. This is the baseline — Task 6 will revoke these and the same query must return zero rows.

---

## Task 1: Augment `src/proxy.ts`

**Files:**
- Modify: `src/proxy.ts` — lines 1–80 (public path list + post-getUser onboarding guard)

- [ ] **Step 1.1: Add new public paths**

Replace the `PUBLIC_PATHS` array at lines 4–11:

```typescript
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/auth/reset-password",
  "/auth/error",
  "/api/auth/login",
  "/api/push/vapid",
  "/api/notifications/trigger",
  "/api/stripe/webhook",
];
```

- [ ] **Step 1.2: Add the protected-route prefix list and the onboarding guard**

After the existing `getUser()` call and the existing `!user` redirect (which stays unchanged), insert:

```typescript
const ONBOARDING_PROTECTED_PREFIXES = [
  "/home",
  "/chat",
  "/goals",
  "/tasks",
  "/observations",
  "/plan",
  "/settings",
];

function needsOnboardingCheck(pathname: string): boolean {
  return ONBOARDING_PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
```

Then, inside the `proxy` function, immediately after the existing `if (!user && !isPublicPath(pathname))` block (which redirects unauthenticated users), add:

```typescript
if (user && needsOnboardingCheck(pathname)) {
  const { data: row } = await supabase
    .from("users")
    .select("onboarding_complete")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (row && row.onboarding_complete === false) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }
}
```

- [ ] **Step 1.3: Verify tsc + build**

Run:
```bash
npx tsc --noEmit
npm run build
```
Both must exit 0. Build output must list `ƒ Proxy (Middleware)` (Next.js still labels it that way in build output).

- [ ] **Step 1.4: Manual smoke test (dev server)**

```bash
npm run dev
```
In a separate terminal:
```bash
# Unauthenticated → 307 redirect to /login
curl -sI http://localhost:3000/home | head -5
# API unauthenticated → 401 JSON
curl -s http://localhost:3000/api/reid -X POST | head -3
```
Kill `npm run dev` when done.

- [ ] **Step 1.5: Commit**

```bash
git add src/proxy.ts
git commit -m "security(proxy): add signup/reset public paths + onboarding guard

- Add /signup, /forgot-password, /auth/reset-password, /api/auth/login
  to PUBLIC_PATHS.
- After getUser(), check users.onboarding_complete for /home, /chat,
  /goals, /tasks, /observations, /plan, /settings — redirect to
  /onboarding if false. One DB read per protected nav.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Security headers in `next.config.ts`

**Files:**
- Modify: `next.config.ts` (full rewrite — file is currently 9 lines)

- [ ] **Step 2.1: Rewrite `next.config.ts`**

Replace the entire file with:

```typescript
import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const cspDirectives = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://exp.host https://api.elevenlabs.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2.2: Verify tsc + build**

```bash
npx tsc --noEmit
npm run build
```
Both must exit 0.

- [ ] **Step 2.3: Verify headers are emitted**

```bash
npm run dev
sleep 4
curl -sI http://localhost:3000/login | grep -iE "(content-security-policy|x-frame-options|strict-transport|referrer-policy|x-content-type)"
```
Expected: at least 5 matching headers, including `Content-Security-Policy-Report-Only`. Kill dev server.

- [ ] **Step 2.4: Commit**

```bash
git add next.config.ts
git commit -m "security(headers): add CSP report-only, HSTS, X-Frame, etc.

- CSP runs in Report-Only this sprint so we can monitor real traffic
  for violations before enforcing.
- HSTS 2 years incl subdomains + preload.
- X-Frame-Options DENY, X-Content-Type-Options nosniff,
  Referrer-Policy strict-origin-when-cross-origin,
  Permissions-Policy camera/mic/geo/payment off.
- poweredByHeader: false, images.remotePatterns scoped to Supabase
  storage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Replace magic-link with email + password

This task has several subtasks; complete in order. Subtask 3.1 (wipe auth.users) is irreversible — do it last, right before the prod deploy in Task 8. Implementation order: 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → commit. Then 3.1 runs in Task 8 only.

### 3.2 Rewrite `src/lib/session.ts`

**Files:**
- Modify: `src/lib/session.ts` (delete `signInWithMagicLink`; add validators + 4 password fns)

- [ ] **Step 3.2.1: Remove `signInWithMagicLink`**

Delete lines 38–52 of `src/lib/session.ts` (the entire `export async function signInWithMagicLink` block).

- [ ] **Step 3.2.2: Add password-auth exports immediately above `signOut`**

Insert before `export async function signOut(): Promise<void>`:

```typescript
export const PASSWORD_MIN_LENGTH = 12;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return "Enter your email.";
  if (trimmed.length > 254) return "That email is too long.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(trimmed) ? null : "That email doesn't look right.";
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs a number.";
  return null;
}

const GENERIC_LOGIN_ERROR =
  "That's not right. Check your email and password.";

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
    if (res.ok) return { error: null };
    if (res.status === 429) {
      const data = (await res.json().catch(() => ({}))) as {
        retryAfter?: number;
      };
      const seconds = data.retryAfter ?? 60;
      return {
        error: {
          message: `Too many tries. Wait ${seconds}s and try again.`,
        },
      };
    }
    return { error: { message: GENERIC_LOGIN_ERROR } };
  } catch {
    return { error: { message: GENERIC_LOGIN_ERROR } };
  }
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ error: { message: string } | null }> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  if (error) {
    console.error("[signUpWithPassword]", error.message);
    return { error: { message: "Could not create account. Try again." } };
  }
  return { error: null };
}

export async function requestPasswordReset(
  email: string,
): Promise<{ error: null }> {
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/reset-password`
      : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    redirectTo ? { redirectTo } : undefined,
  );
  if (error) console.error("[requestPasswordReset]", error.message);
  return { error: null };
}

export async function updatePassword(
  password: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[updatePassword]", error.message);
    return { error: { message: "Could not update password. Try again." } };
  }
  return { error: null };
}
```

- [ ] **Step 3.2.3: Verify tsc**

```bash
npx tsc --noEmit
```
Must exit 0.

### 3.3 Tiny unit tests for validators

**Files:**
- Create: `src/lib/__tests__/validators.test.ts`

- [ ] **Step 3.3.1: Write the test file**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateEmail,
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "../session";

test("validateEmail accepts a normal address", () => {
  assert.equal(validateEmail("foo@bar.com"), null);
  assert.equal(validateEmail("  foo@bar.com  "), null);
});

test("validateEmail rejects empty / malformed / too long", () => {
  assert.match(validateEmail("") ?? "", /Enter your email/);
  assert.match(validateEmail("not-an-email") ?? "", /doesn't look right/);
  assert.match(validateEmail("a@b") ?? "", /doesn't look right/);
  assert.match(
    validateEmail("a".repeat(255) + "@b.com") ?? "",
    /too long/,
  );
});

test("validatePassword enforces length, upper, digit", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 12);
  assert.match(validatePassword("short") ?? "", /at least 12/);
  assert.match(validatePassword("nouppercase123") ?? "", /uppercase/);
  assert.match(validatePassword("NODIGITSHERE!") ?? "", /number/);
  assert.equal(validatePassword("GoodPassword12"), null);
});
```

- [ ] **Step 3.3.2: Run the tests**

```bash
node --test --experimental-strip-types src/lib/__tests__/validators.test.ts
```
Note: Node 24 includes type-stripping for TS; this avoids a tsconfig change. All 3 tests must pass.

If Node 24 type-stripping rejects the import path (e.g., wants `.ts` suffix), edit the import to:
```typescript
import { validateEmail, validatePassword, PASSWORD_MIN_LENGTH } from "../session.ts";
```
Then re-run.

### 3.4 Create `/api/auth/login` server route

**Files:**
- Create: `src/app/api/auth/login/route.ts`

- [ ] **Step 3.4.1: Write the route**

```typescript
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit } from "@/lib/ratelimit";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const limit = await checkLoginRateLimit(email);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limit_exceeded", retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Route handlers can't set cookies in some contexts.
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) {
    console.error("[api/auth/login] sign-in failed:", error.message);
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3.4.2: Verify tsc**

This will fail until `checkLoginRateLimit` is added in Task 5. Defer the build check to Task 5. For now run:
```bash
grep -n "checkLoginRateLimit" src/app/api/auth/login/route.ts
```
Confirm the import is present.

### 3.5 Rewrite `src/app/login/page.tsx`

**Files:**
- Modify: `src/app/login/page.tsx` (full rewrite)

- [ ] **Step 3.5.1: Read the existing file**

```bash
head -200 src/app/login/page.tsx
```
Note the existing classNames, LogoMark import, Checkbox import (for terms checkbox), and `useAuth` usage. Preserve them.

- [ ] **Step 3.5.2: Replace the file**

Write the new content while preserving the existing visual structure. Replace the `<LoginInner />` function body and the magic-link UI states with this (do NOT change the surrounding `Suspense`/wrapper if present):

```typescript
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) router.replace(next ?? "/home");
  }, [loading, session, next, router]);

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
    const { error: err } = await signInWithPassword(email, password);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(next ?? "/home");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <LogoMark />
        </div>
        <h1 className="text-2xl font-serif text-center mb-6">Welcome back</h1>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
            placeholder="Password"
            autoComplete="current-password"
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
            {submitting ? "Signing in…" : "Continue →"}
          </button>
        </form>
        <div className="mt-6 flex flex-col items-center gap-2 text-sm text-neutral-400">
          <p>
            No account?{" "}
            <Link href="/signup" className="text-white underline">
              Create one
            </Link>
          </p>
          <Link href="/forgot-password" className="hover:text-white">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className="min-h-screen bg-black" aria-hidden />}
    >
      <LoginInner />
    </Suspense>
  );
}
```

> **Note:** if the existing login page uses custom motion/animations (e.g. `framer-motion`) or a different visual structure, keep that wrapper and replace only the form + submit handler. The substantive change is replacing the magic-link form with the password form and switching to `signInWithPassword`.

- [ ] **Step 3.5.3: Verify tsc**

```bash
npx tsc --noEmit
```

### 3.6 New `src/app/signup/page.tsx`

**Files:**
- Create: `src/app/signup/page.tsx`

- [ ] **Step 3.6.1: Write the file**

```typescript
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
```

- [ ] **Step 3.6.2: Verify tsc**

```bash
npx tsc --noEmit
```

### 3.7 New `src/app/forgot-password/page.tsx`

**Files:**
- Create: `src/app/forgot-password/page.tsx`

- [ ] **Step 3.7.1: Write the file**

```typescript
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
              If that email is registered, you'll receive a reset link
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
```

- [ ] **Step 3.7.2: Verify tsc**

```bash
npx tsc --noEmit
```

### 3.8 New `src/app/auth/reset-password/page.tsx`

**Files:**
- Create: `src/app/auth/reset-password/page.tsx`

- [ ] **Step 3.8.1: Write the file**

This page is the destination Supabase sends users to after clicking the email reset link. Supabase, in the SSR cookie-flow, sets a temporary recovery session via the link's `code`. The page exchanges the code (if present in URL), then renders the set-new-password form.

```typescript
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
        if (!cancelled && ex) {
          setExchangeError(
            "This reset link is invalid or expired. Request a new one.",
          );
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && !data.session) {
          setExchangeError(
            "This reset link is invalid or expired. Request a new one.",
          );
        }
      }
      if (!cancelled) setExchanging(false);
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
```

- [ ] **Step 3.8.2: Verify tsc**

```bash
npx tsc --noEmit
```

### 3.9 Confirm dead code is gone

- [ ] **Step 3.9.1: Grep for magic-link references**

```bash
grep -rn "signInWithMagicLink\|signInWithOtp" src/ --include="*.ts" --include="*.tsx"
```
Must return zero matches.

- [ ] **Step 3.9.2: Check for any remaining link to `/auth/error`**

```bash
grep -rn "auth/error\|/auth/error" src/ --include="*.ts" --include="*.tsx"
```
If the only match is `src/app/auth/error/page.tsx` itself, the page is unreferenced — but it's still valid as a generic auth-error landing for `/auth/callback` failures. **Leave it as-is.** (Auth-callback still redirects to it on bad code exchange.)

### 3.10 Verify the auth surface compiles end-to-end

- [ ] **Step 3.10.1: Build the whole app**

```bash
npx tsc --noEmit
```
Expected: exit 0. If `/api/auth/login` errors on the missing `checkLoginRateLimit` import, that's expected — Task 5 adds it. Continue to commit only once Task 5 is also done.

### 3.11 Commit (after Task 5 lands)

Hold the commit for Task 3 until Task 5 is complete, since `/api/auth/login` references `checkLoginRateLimit`. See Task 5.6 for the combined commit.

---

## Task 4: Targeted API hardening

### 4.1 Sanitise `/api/observe`

**Files:**
- Modify: `src/app/api/observe/route.ts` (lines 180–183)

- [ ] **Step 4.1.1: Read the current error response**

```bash
sed -n '170,190p' src/app/api/observe/route.ts
```

- [ ] **Step 4.1.2: Replace the error response**

Find the block returning `{ error: "anthropic_failed", detail: message }` and replace its `return NextResponse.json(...)` with:

```typescript
console.error("[api/observe] anthropic failed:", message);
return NextResponse.json(
  { error: "service_unavailable" },
  { status: 502 },
);
```

The exact `message` variable name may be `message` or `err.message` — keep the existing variable, just don't return it.

- [ ] **Step 4.1.3: Verify tsc**

```bash
npx tsc --noEmit
```

### 4.2 Zod schema for `/api/push/subscribe-native`

**Files:**
- Modify: `src/app/api/push/subscribe-native/route.ts`

- [ ] **Step 4.2.1: Read the current manual narrowing**

```bash
head -50 src/app/api/push/subscribe-native/route.ts
```

- [ ] **Step 4.2.2: Replace manual narrowing with Zod**

If the file doesn't import `z`, add `import { z } from "zod";` at the top. Then replace the manual narrowing block (lines ~14–30 — wherever `typeof body.endpoint === "string"` checks live) with:

```typescript
const Body = z.object({
  endpoint: z.string().min(10).max(2000),
  platform: z.enum(["ios", "android"]).optional(),
});

const parsed = Body.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}
const { endpoint, platform } = parsed.data;
```

> If the existing schema has additional fields (e.g. `device_id`, `expo_token`), preserve them by adding to the Body shape. Read the route fully before editing to confirm the field list.

- [ ] **Step 4.2.3: Verify tsc + build**

```bash
npx tsc --noEmit
npm run build
```

### 4.3 Timing-safe cron Bearer comparisons

**Files:**
- Modify: `src/app/api/notifications/trigger/route.ts`
- Modify: `src/app/api/cron/reengage/route.ts`

- [ ] **Step 4.3.1: Add a shared helper**

Create `src/lib/timing-safe.ts`:

```typescript
import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison. Returns false on length mismatch
 *  without timing leak. */
export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (!a) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

- [ ] **Step 4.3.2: Update `src/app/api/notifications/trigger/route.ts`**

Locate the existing Bearer check (around lines 281–283 per diagnostic):
```typescript
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
```
Replace with:
```typescript
import { safeEqual } from "@/lib/timing-safe";
// ...
if (!safeEqual(auth, `Bearer ${process.env.CRON_SECRET ?? ""}`)) {
```
The `import` goes at the top of the file alongside other imports; the `if` replaces the existing one.

- [ ] **Step 4.3.3: Update `src/app/api/cron/reengage/route.ts`**

Find the equivalent Bearer string-equality check (per diagnostic, around line 54). Apply the same replacement:
```typescript
import { safeEqual } from "@/lib/timing-safe";
// ...
return safeEqual(req.headers.get("authorization"), `Bearer ${expected}`);
```

- [ ] **Step 4.3.4: Verify tsc + build**

```bash
npx tsc --noEmit
npm run build
```

### 4.4 Verify no remaining error leaks

- [ ] **Step 4.4.1: Grep**

```bash
grep -rn "err\.message\|error\.message\|\.stack" src/app/api/ --include="*.ts" | grep -v "console\." | grep -v "//"
```
Must return zero matches — or only matches in `console.*` lines, which we've already filtered. Anything else means a route returns an error message to the client and needs fixing.

### 4.5 Commit Task 4

```bash
git add src/app/api/observe/route.ts \
        src/app/api/push/subscribe-native/route.ts \
        src/app/api/notifications/trigger/route.ts \
        src/app/api/cron/reengage/route.ts \
        src/lib/timing-safe.ts
git commit -m "security(api): sanitise /api/observe, zod on push native, timing-safe cron

- /api/observe no longer returns raw Anthropic error message in JSON.
- /api/push/subscribe-native uses Zod schema like /subscribe.
- /api/notifications/trigger and /api/cron/reengage now use
  crypto.timingSafeEqual via src/lib/timing-safe.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Rate limiting

### 5.1 Add login + per-minute limiters to `src/lib/ratelimit.ts`

**Files:**
- Modify: `src/lib/ratelimit.ts`

- [ ] **Step 5.1.1: Append the new limiters**

At the bottom of `src/lib/ratelimit.ts`, after `checkDailyMessageLimit`, add:

```typescript
/** 5 failed-or-attempted logins per email per 15 minutes. */
export async function checkLoginRateLimit(emailLower: string): Promise<{
  allowed: boolean;
  retryAfter: number;
}> {
  const windowSec = 15 * 60;
  const key = `reid:rl:login:${emailLower}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 5) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

/** 8 Reid messages per user per 60s — burst protection on top of the
 *  daily quota in checkDailyMessageLimit. */
export async function checkReidMinuteLimit(userId: string): Promise<{
  allowed: boolean;
  retryAfter: number;
}> {
  const windowSec = 60;
  const key = `reid:rl:minute:${userId}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 8) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}
```

- [ ] **Step 5.1.2: Verify tsc**

```bash
npx tsc --noEmit
```
Expected: zero errors, including in `/api/auth/login/route.ts` (now that `checkLoginRateLimit` exists).

### 5.2 Wire per-minute limit into `/api/reid`

**Files:**
- Modify: `src/app/api/reid/route.ts`

- [ ] **Step 5.2.1: Read the existing daily-limit usage**

```bash
grep -n "checkDailyMessageLimit\|rate_limit\|429" src/app/api/reid/route.ts
```

- [ ] **Step 5.2.2: Add the minute check after the daily check**

Locate the existing `checkDailyMessageLimit` call. Immediately after it (after the daily-block early-return), insert:

```typescript
import { checkReidMinuteLimit } from "@/lib/ratelimit";
// ... (import goes with other imports at the top)

// Inside the handler, AFTER the existing daily check:
const minute = await checkReidMinuteLimit(user.id);
if (!minute.allowed) {
  return NextResponse.json(
    {
      error: "rate_limit_exceeded",
      retryAfter: minute.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(minute.retryAfter),
        "X-RateLimit-Limit": "8",
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
```

> The import line goes once at the top, alongside the existing `checkDailyMessageLimit` import. The block goes in the handler body.

- [ ] **Step 5.2.3: Tighten the Zod max on user message content**

Find the Zod schema for the request body. The current schema validates `messages` as an array with `content.max(8000)`. Change `8000` → `4000`:

```bash
grep -n "max(8000)" src/app/api/reid/route.ts
```
Replace each occurrence of `.max(8000)` with `.max(4000)` for the user message content field only. Do not change the array length cap or other fields.

- [ ] **Step 5.2.4: Verify tsc + build**

```bash
npx tsc --noEmit
npm run build
```

### 5.3 Commit Tasks 3 + 5 together

Task 3's `/api/auth/login` route only compiles after Task 5.1 adds `checkLoginRateLimit`. Commit them together to keep the tree compiling.

- [ ] **Step 5.3.1: Stage and commit**

```bash
git add src/lib/session.ts \
        src/lib/__tests__/validators.test.ts \
        src/app/api/auth/login/route.ts \
        src/app/login/page.tsx \
        src/app/signup/page.tsx \
        src/app/forgot-password/page.tsx \
        src/app/auth/reset-password/page.tsx \
        src/lib/ratelimit.ts \
        src/app/api/reid/route.ts
git commit -m "security(auth+rate): password auth + login & burst rate limits

- Drop signInWithMagicLink. Add signInWithPassword (via new server
  route /api/auth/login), signUpWithPassword, requestPasswordReset,
  updatePassword, validateEmail, validatePassword (12+ chars).
- New pages: /signup, /forgot-password, /auth/reset-password. /login
  rewritten for sign-in only with generic 'wrong email or password'
  message (no account enumeration).
- Add checkLoginRateLimit (5 / 15min per email) used by
  /api/auth/login; add checkReidMinuteLimit (8 / 60s per user) used
  by /api/reid. Tighten Reid Zod max from 8000 to 4000 chars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Supabase RLS migrations

Use the Supabase MCP `apply_migration` tool for each — never `execute_sql` for DDL. Project: `wzmoeutpxndeqgfsnfci`.

- [ ] **Step 6.1: `lock_billing_columns_authenticated_anon`**

Call `apply_migration` with `name="lock_billing_columns_authenticated_anon"` and `query`:

```sql
REVOKE UPDATE (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
ON public.users FROM authenticated;
REVOKE UPDATE (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
ON public.users FROM anon;
REVOKE INSERT (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
ON public.users FROM authenticated;
REVOKE INSERT (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
ON public.users FROM anon;
```

- [ ] **Step 6.2: `revoke_security_definer_public_exec`**

`apply_migration` name=`revoke_security_definer_public_exec`, query:

```sql
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
```

> `current_user_id()` stays callable — RLS policies rely on it. Trigger-attached functions continue to fire from within triggers regardless of grants.

- [ ] **Step 6.3: `drop_dead_handle_new_user`**

`apply_migration` name=`drop_dead_handle_new_user`, query:

```sql
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
```

- [ ] **Step 6.4: `tighten_waitlist_anon_insert`**

`apply_migration` name=`tighten_waitlist_anon_insert`, query:

```sql
DROP POLICY IF EXISTS "Allow anon insert" ON public.reid_waitlist;
CREATE POLICY "Allow anon insert"
  ON public.reid_waitlist
  FOR INSERT
  TO anon
  WITH CHECK (
    email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND length(email) <= 254
  );
```

- [ ] **Step 6.5: `wrap_auth_uid_in_select_users_policies`**

`apply_migration` name=`wrap_auth_uid_in_select_users_policies`, query:

```sql
ALTER POLICY "users self read" ON public.users
  USING (auth_id = (SELECT auth.uid()));
ALTER POLICY "users self update" ON public.users
  USING (auth_id = (SELECT auth.uid()))
  WITH CHECK (auth_id = (SELECT auth.uid()));
```

- [ ] **Step 6.6: Verify the C1 exploit is closed**

Run via `execute_sql`:

```sql
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='users'
  AND grantee IN ('authenticated','anon')
  AND column_name IN ('subscription_status','stripe_customer_id','subscription_period_end','subscription_id','subscribed_at')
  AND privilege_type IN ('UPDATE','INSERT')
ORDER BY grantee, column_name, privilege_type;
```
Expected: **zero rows.** This is the gate-blocking POC for C1.

Also re-fetch Supabase advisors:

```
get_advisors with type="security"
```
Expected: `0028` and `0029` advisors for `handle_new_user`, `handle_new_auth_user`, `rls_auto_enable` should be gone or reduced. (`current_user_id` may remain — intentional.)

- [ ] **Step 6.7: No git commit for migrations**

Migrations are tracked in Supabase, not in the repo. Move on to Task 7.

---

## Task 7: Env + infra verification

- [ ] **Step 7.1: Confirm no env files in git history**

```bash
git log --all --full-history -- '*.env*' '.env' '.env.local' '.env.production'
```
Expected: empty output.

- [ ] **Step 7.2: Confirm .gitignore covers env files**

```bash
grep -E "^\.env" .gitignore
```
Expected: at least `.env*` (or equivalent coverage).

- [ ] **Step 7.3: Audit NEXT_PUBLIC_ usage**

```bash
grep -rEn "NEXT_PUBLIC_[A-Z_]+" src/ --include="*.ts" --include="*.tsx" | \
  grep -v "NEXT_PUBLIC_SUPABASE_URL\|NEXT_PUBLIC_SUPABASE_ANON_KEY\|NEXT_PUBLIC_APP_URL\|NEXT_PUBLIC_VAPID_PUBLIC_KEY\|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
```
Expected: empty output. Any unexpected `NEXT_PUBLIC_*` must be reviewed.

- [ ] **Step 7.4: `npm audit` at high+**

```bash
npm audit --audit-level=high
```
Expected: `found 0 vulnerabilities` (or "0 high, 0 critical"). The 2 moderate postcss CVEs are accepted — they ship with Next.js and require an upstream patch.

- [ ] **Step 7.5: Confirm `NEXT_PUBLIC_APP_URL` is in Vercel prod env**

```bash
npx vercel env ls production | grep NEXT_PUBLIC_APP_URL
```
Expected: row present. If missing, add via:
```bash
echo "https://reid-app.vercel.app" | npx vercel env add NEXT_PUBLIC_APP_URL production
```

- [ ] **Step 7.6: No commit for Task 7**

It's verification only.

---

## Task 8: Gate, preview, prod

- [ ] **Step 8.1: Final gate sweep — TypeScript + build**

```bash
npx tsc --noEmit
npm run build
```
Both must exit 0.

- [ ] **Step 8.2: Grep gate (all must produce zero matches)**

```bash
echo "=== magic-link gone ==="
grep -rn "signInWithMagicLink\|signInWithOtp" src/ --include="*.ts" --include="*.tsx"

echo "=== no getSession in proxy or API ==="
grep -rn "getSession" src/proxy.ts src/app/api/ --include="*.ts"

echo "=== max_tokens hardcoded 2048 ==="
grep -n "max_tokens" src/app/api/reid/route.ts | grep -v 2048

echo "=== no err/error.message returned to clients ==="
grep -rn "err\.message\|error\.message\|\.stack" src/app/api/ --include="*.ts" | grep -v "console\." | grep -v "//"

echo "=== security headers present ==="
grep -nE "X-Content-Type-Options|Strict-Transport-Security|Content-Security-Policy|X-Frame-Options" next.config.ts

echo "=== no secret NEXT_PUBLIC_ vars ==="
grep -rEn "NEXT_PUBLIC_(ANTHROPIC|SERVICE_ROLE|STRIPE_SECRET|.*SECRET|.*PRIVATE)" src/ --include="*.ts" --include="*.tsx"
```
All five must print only the header line (no matches below it). Final grep for security-headers is the only one that should produce matches.

- [ ] **Step 8.3: Per-route auth check sweep**

```bash
for f in $(find src/app/api -name "route.ts"); do
  if ! grep -q "getAuthedUser\|CRON_SECRET\|constructEventAsync\|VAPID_PUBLIC_KEY\|api/auth/login" "$f" \
     && ! grep -q "PUBLIC" "$f"; then
    echo "REVIEW NEEDED: $f"
  fi
done
```
Expected: empty output (every route either authenticates the user, validates a cron secret, validates a webhook signature, serves the public VAPID key, or is the public `/api/auth/login`).

> The `/api/auth/login` route is intentionally unauthenticated — that's its job. The grep above accepts it via the `api/auth/login` clause.

- [ ] **Step 8.4: Preview deploy**

```bash
npx vercel
```
Capture the preview URL.

- [ ] **Step 8.5: Manual smoke test on preview**

Open the preview URL and walk through:
1. `/signup` → submit fresh email + 12-char password → "Check your email" screen.
2. Confirm via Supabase auth dashboard that a user row appeared with `email_confirmed_at = null` (until you click the email link).
3. Click the email confirmation link → land on `/home` (or `/onboarding`).
4. From `/home`, send a message in `/chat` → response streams.
5. Sign out, hit `/login` → enter wrong password 6 times → 6th attempt returns 429 (verify in network tab).
6. `/forgot-password` → request reset → click link → set new password → redirected to `/home`.
7. Attempt the C1 POC in a browser console with the signed-in session:
   ```javascript
   await window.supabase.from('users').update({ subscription_status: 'pro' }).eq('auth_id', (await window.supabase.auth.getUser()).data.user.id)
   ```
   Expected: permission error (`42501` or HTTP 403). If it succeeds, halt — Task 6.6 failed.

- [ ] **Step 8.6: Wipe `auth.users` on production Supabase**

User-confirmed pre-launch wipe. Via `execute_sql`:

```sql
DELETE FROM auth.users;
```

Then verify with `SELECT count(*) FROM auth.users;` → expected `0`.

- [ ] **Step 8.7: Production deploy**

```bash
npx vercel --prod
```

- [ ] **Step 8.8: Post-deploy verification**

Re-run the C1 POC from Step 8.5 on the prod URL with a freshly signed-up account. Expected: permission denied. Capture the response and paste into the final commit message or PR description.

- [ ] **Step 8.9: Final summary commit**

If any uncommitted changes remain (none expected), commit them with a summary message. Otherwise the sprint is done — the per-task commits already tell the story.

---

## Self-Review

Spec coverage:
- C1 → Task 6.1 + 6.6 verification ✓
- C2 → Task 6.2, 6.3 ✓
- H1 → Task 2 ✓
- H2 → Task 5.1 + 5.3 (via /api/auth/login) ✓
- H3 → Task 3.2 generic-error mapping in `signInWithPassword` + login page ✓
- H4 → Task 1.2 ✓
- H5 → Task 4.1 ✓
- H6 → Task 5.2 ✓
- M1 → Task 6.4 ✓
- M2 → Task 4.3 ✓
- M3 → Task 6.5 ✓
- M4 → Task 4.2 ✓
- M5 → flagged as Supabase dashboard toggle; out of code scope, leave for follow-up ⚠️ (not blocking)
- L1, L2, L3 → out of scope ✓
- Gate criteria → Task 8 ✓
- Rollout: preview → wipe → prod → verify ✓

Placeholder scan: none — every step has full code or full commands.

Type consistency: `signInWithPassword`, `signUpWithPassword`, `requestPasswordReset`, `updatePassword`, `validateEmail`, `validatePassword`, `PASSWORD_MIN_LENGTH`, `checkLoginRateLimit`, `checkReidMinuteLimit`, `safeEqual` — names match across all tasks.

One follow-up note (not blocking): M5 (Supabase leaked-password protection) is a dashboard toggle, not code; track separately.

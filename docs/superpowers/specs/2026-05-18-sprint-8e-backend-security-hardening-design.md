# Sprint 8E — Backend Security Hardening

**Date:** 2026-05-18
**Status:** Approved for implementation
**Scope:** Auth migration, RLS lockdown, security headers, targeted API hardening, rate limiting
**Out of scope:** 2FA/MFA, nonce-based CSP, BotID, postcss upgrade (blocked on Next.js patch)

## Context

Reid is a Next.js 16 + Supabase + Anthropic app at `~/Documents/reid-app`. Sprint 8D shipped. Auth is currently magic-link only. Active codebase already has middleware-equivalent (`src/proxy.ts`), per-route Bearer auth (`src/lib/supabase-auth.ts::getAuthedUser`), Zod body validation on nearly every API route, hardcoded `max_tokens` on `/api/reid`, and a daily message + session limit.

The original Sprint 8E spec was written without reading the codebase and made several false claims about current state (no middleware, missing auth checks, max_tokens overrideable, etc.). This design replaces that spec wherever it conflicts with reality, while preserving its non-negotiables: `getUser()` over `getSession()`, account-enumeration prevention, 12-char password minimum, server-only billing writes, security headers.

## Findings (verified)

### CRITICAL

**C1. Self-promotion to Pro.** `public.users` UPDATE policy is row-scoped (`auth_id = auth.uid()`). `authenticated` role holds column-level UPDATE on `subscription_status`, `stripe_customer_id`, `subscription_id`, `subscribed_at`, `subscription_period_end`. Any logged-in user can `supabase.from('users').update({ subscription_status: 'pro' }).eq('auth_id', userId)` and become Pro forever. **Verified by direct query of `information_schema.column_privileges`.**

**C2. SECURITY DEFINER functions callable by anon/authenticated.** Four functions exposed via PostgREST RPC: `current_user_id`, `handle_new_user` (dead — references missing `profiles` table), `handle_new_auth_user`, `rls_auto_enable`. The last is particularly dangerous if abusable. Verified via Supabase advisors.

### HIGH

- **H1.** No security headers in `next.config.ts` — missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **H2.** No app-layer rate limit on login. Only Supabase OTP limit. Brute force risk after password migration.
- **H3.** Account enumeration risk in password flow (must collapse "wrong email" + "wrong password" to one message).
- **H4.** `/home` and other protected pages have no onboarding-completion guard. Only `/` (root) redirects.
- **H5.** `/api/observe` returns raw Anthropic `err.message` to client (route.ts:180–183).
- **H6.** No per-minute burst limit on `/api/reid` — daily + session limits exist, minute does not.

### MEDIUM

- **M1.** `reid_waitlist` anon INSERT policy uses `WITH CHECK true` — spam vector.
- **M2.** Cron Bearer comparison is not timing-safe.
- **M3.** `users` RLS policies use bare `auth.uid()` — Supabase advisor `0003_auth_rls_initplan` recommends `(SELECT auth.uid())`.
- **M4.** `/api/push/subscribe-native` uses manual narrowing instead of Zod.
- **M5.** Supabase leaked-password protection disabled (HaveIBeenPwned check).

### LOW

- **L1.** `set_updated_at` mutable `search_path` (advisor `0011`).
- **L2.** Moderate `postcss` CVE — patched in next Next.js minor; wait.
- **L3.** Native push endpoint not device-bound (caller can register any Expo token under their auth).

## Goals

1. Eliminate the self-promotion path (C1, C2) before any further user signs up.
2. Replace magic-link with email+password. Wipe existing `auth.users` (user-confirmed: pre-launch, no migration debt).
3. Add security headers in enforcing mode where safe, Report-Only for CSP.
4. Close the per-minute burst and login brute-force gaps.
5. Sanitize the one remaining error leak.
6. Ship a preview deploy, manually verify, then promote to prod.

## Non-Goals

- 2FA, MFA, social login, magic-link as fallback — none of these.
- Refactoring `/api/reid` cost logging — separate sprint.
- Per-route CORS configuration — Next.js default same-origin is sufficient.
- Rewriting existing API routes for "defense in depth" auth checks — middleware + per-route Bearer validation is already two layers.

## Design

### Agent 1 (BLOCKING) — Augment `src/proxy.ts`

Keep the existing file. Modifications:

1. Add `/signup`, `/forgot-password`, `/auth/reset-password` to `PUBLIC_PATHS`.
2. After the `getUser()` call, if a user is present and `pathname` matches a protected route prefix (`/home`, `/chat`, `/goals`, `/tasks`, `/observations`, `/plan`, `/settings`), do a lightweight read of `users.onboarding_complete`. If false, redirect to `/onboarding`. Skip the read for `/onboarding` itself, `/api/*`, and `/login`.
   - One DB hit per protected nav. Acceptable.
   - Cache option: read it from the JWT app_metadata if we choose to mirror it there. Out of scope for this sprint.

Preserve: Bearer-token bypass for native clients (lines 25–31).

### Agent 2 (BLOCKING) — Security headers in `next.config.ts`

Add `async headers()` returning two header groups:

**Enforced headers (all routes):**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

**CSP in Report-Only mode for this sprint:**
- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` (Next.js inline bootstrap; nonce strategy is a future sprint). Dev adds `'unsafe-eval'`.
- `style-src 'self' 'unsafe-inline'` + Google Fonts if used
- `font-src 'self' data: https://fonts.gstatic.com`
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://exp.host https://api.elevenlabs.io`
- `img-src 'self' data: blob: https://*.supabase.co`
- `frame-ancestors 'none'`
- `base-uri 'self'`
- `form-action 'self'`

Top-level config additions:
- `poweredByHeader: false` (canonical Next.js way).
- `images.remotePatterns`: scope to Supabase storage domain only.

**CSP runs as `Content-Security-Policy-Report-Only` for this sprint.** Switch to enforcing in a follow-up after monitoring for real violations.

### Agent 3 (BLOCKING) — Password auth

**Database step (before code):** wipe `auth.users` via Supabase MCP. One-time, irreversible. User has confirmed.

**`src/lib/session.ts`:**
- Delete: `signInWithMagicLink`.
- Add: `validateEmail`, `validatePassword` (12-char min, ≥1 upper, ≥1 digit), `signInWithPassword`, `signUpWithPassword`, `requestPasswordReset`, `updatePassword`.
- All three sign-in/up/reset return a single generic error string on failure ("That's not right. Check your email and password."). No path-specific messaging.
- Emails lowercased before submission to prevent dup accounts.
- Keep all profile-helpers (`getMe`, `getMyGoals`, etc.) — they're auth-agnostic.

**Pages:**
- `src/app/login/page.tsx` — rewrite for sign-in only. Keep existing visual structure. Generic error. Link to `/signup` and `/forgot-password`.
- `src/app/signup/page.tsx` — new. Mirror login design. On success → "Check your email to confirm your account" (Supabase email confirmation flow).
- `src/app/forgot-password/page.tsx` — new. Single email field. Always shows "If that email is registered, you'll receive a reset link" — never confirms existence.
- `src/app/auth/reset-password/page.tsx` — new (page, not route). Reads the recovery session that Supabase sets when the user clicks the reset link. Shows set-new-password form. Validates strength. On success → `/home`.

**Keep `/auth/callback/route.ts` as-is.** It handles:
- Email-confirmation `code` exchange on signup
- Password-recovery `code` exchange (`type=recovery`)
- `ensureUserRow` provisioning

**Delete `/auth/error/page.tsx`** only after Agent 3 grep confirms no remaining references.

**Verification grep (gate):** `grep -rn "signInWithMagicLink\|signInWithOtp" src/` must return zero.

### Agent 4 — Targeted API hardening (after 1–3)

- `/api/observe` line 180–183: replace `{ error: "anthropic_failed", detail: message }` with `{ error: "service_unavailable" }`. Log `err` server-side via `console.error`.
- `/api/push/subscribe-native`: add Zod schema matching `subscribe`.
- `/api/notifications/trigger` and `/api/cron/reengage`: replace `auth !== \`Bearer ${secret}\`` with `crypto.timingSafeEqual(Buffer.from(auth ?? ''), Buffer.from(\`Bearer ${secret}\`))` (guard against differing lengths first).
- Run a final grep across `src/app/api/` for `\.stack|err\.message` returned in responses — confirm zero.

### Agent 5 — Rate limiting (after 1–3)

`src/lib/ratelimit.ts` additions:

- `checkLoginRateLimit(emailLower)` — 5 attempts / 15 min sliding window via Upstash. Returns `{ allowed, retryAfter }`.
- `checkReidMinuteLimit(userId)` — 8 requests / 60s. Returns same shape.

Wire-in:
- Login: Supabase password auth runs on the client, so the rate limit must run on the server. Approach: a tiny `/api/auth/login` route that takes `{ email, password }`, runs `checkLoginRateLimit`, then `signInWithPassword` via a server-side Supabase client; on success sets the session cookies via the SSR client. Client form posts to this route instead of calling Supabase directly. Add `/api/auth/login` to `PUBLIC_PATHS`.
- Reid: in `/api/reid` POST, after the existing daily/session check, run minute limit. Return 429 + Retry-After header on miss.

Also: tighten `/api/reid` Zod from `max(8000)` to `max(4000)` on user-supplied message content.

### Agent 6 — Supabase RLS migrations (after 1–3)

Each via `apply_migration` (not raw SQL), so the change is in migration history.

1. `lock_billing_columns_authenticated_anon`:
   ```sql
   REVOKE UPDATE (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
   ON public.users FROM authenticated, anon;
   REVOKE INSERT (subscription_status, stripe_customer_id, subscription_id, subscribed_at, subscription_period_end)
   ON public.users FROM authenticated, anon;
   ```
   Server-side service_role keeps full access; Stripe webhook continues to update fields.

2. `revoke_security_definer_public_exec`:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon, authenticated;
   REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
   ```
   Triggers continue to fire (triggers don't go through role grants).

3. `drop_dead_handle_new_user`:
   ```sql
   DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
   ```

4. `tighten_waitlist_anon_insert`:
   ```sql
   DROP POLICY "Allow anon insert" ON public.reid_waitlist;
   CREATE POLICY "Allow anon insert"
     ON public.reid_waitlist FOR INSERT TO anon
     WITH CHECK (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND length(email) <= 254);
   ```

5. `wrap_auth_uid_in_select_users_policies`:
   ```sql
   ALTER POLICY "users self read" ON public.users USING (auth_id = (SELECT auth.uid()));
   ALTER POLICY "users self update" ON public.users
     USING (auth_id = (SELECT auth.uid())) WITH CHECK (auth_id = (SELECT auth.uid()));
   ```

6. (Pre-deploy, manual) **Wipe auth.users** — done immediately before the prod cutover, after preview verification.

### Agent 7 — Env + infra (after 1–3)

- Verify `.env*` not in git history (verified clean).
- Verify `.gitignore` covers `.env*` (verified).
- Verify no `NEXT_PUBLIC_*SECRET*` / `NEXT_PUBLIC_ANTHROPIC*` / `NEXT_PUBLIC_SERVICE_ROLE*` (verified absent).
- `npm audit --audit-level=high` returns zero (current: 0 high, 2 moderate — leave moderate for upstream Next.js patch).
- Confirm `NEXT_PUBLIC_APP_URL` is set in Vercel prod env.

## Gate Criteria (BLOCKING)

```
1.  npx tsc --noEmit                                                   → exit 0
2.  npm run build                                                      → exit 0
3.  grep -rn "signInWithMagicLink\|signInWithOtp" src/                 → empty
4.  grep -rn "getSession" src/proxy.ts src/app/api/                    → empty
5.  grep -n "max_tokens" src/app/api/reid/route.ts | grep -v 2048      → empty
6.  grep -rn "\\.stack\|err\\.message\|error\\.message" src/app/api/ \
        --include='*.ts' | grep -v console                             → empty
7.  grep -n "X-Content-Type-Options\|Strict-Transport-Security\|\
        Content-Security-Policy" next.config.ts                        → matches
8.  Supabase POC: as authenticated user, attempt
        UPDATE public.users SET subscription_status='pro'
        WHERE auth_id = auth.uid()                                     → permission denied
9.  Preview deploy (npx vercel) — sign up new user, confirm email,
    sign in, send a message, attempt password reset                    → works
10. After preview verification: npx vercel --prod
```

## Rollout

1. Land all changes on `main` in a single commit (security commits read better as one diff).
2. Preview deploy. User signs up, confirms email, logs in, sends a chat message, attempts password reset, attempts the C1 exploit (should fail).
3. Wipe `auth.users` on prod Supabase.
4. Promote to prod (`npx vercel --prod`).
5. Monitor CSP report-only logs for 48 hours; flip to enforcing in a follow-up.

## Rollback

- Code: previous commit on `main`. Vercel keeps prior deployments for instant rollback via `vercel rollback`.
- RLS migrations: each is reversible via inverse `GRANT` / `CREATE POLICY` SQL. Document in migration commit message.
- `auth.users` wipe is irreversible — but pre-launch, no migration debt to lose.

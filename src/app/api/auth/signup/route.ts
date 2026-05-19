import { cookies, headers as nextHeaders } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/ratelimit";
import { PASSWORD_MIN_LENGTH } from "@/lib/validators";

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
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
            // Route handlers can't always set cookies. The auth callback
            // re-establishes the session.
          }
        },
      },
    },
  );

  const headerStore = await nextHeaders();
  const origin =
    headerStore.get("origin") ?? headerStore.get("x-forwarded-origin") ?? null;
  const emailRedirectTo = origin ? `${origin}/auth/callback` : undefined;

  const { error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) {
    console.error("[api/auth/signup] sign-up failed:", error.message);
    return NextResponse.json(
      { error: "signup_failed" },
      { status: 400 },
    );
  }
  await resetLoginRateLimit(email);
  return NextResponse.json({ ok: true });
}

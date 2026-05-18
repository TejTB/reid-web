import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/ratelimit";

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
  await resetLoginRateLimit(email);
  return NextResponse.json({ ok: true });
}

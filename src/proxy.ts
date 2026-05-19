import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/auth/reset-password",
  "/auth/error",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/push/vapid",
  "/api/notifications/trigger",
  "/api/stripe/webhook",
];

function isPublicPath(pathname: string): boolean {
  for (const p of PUBLIC_PATHS) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return true;
  }
  return false;
}

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

export async function proxy(request: NextRequest) {
  // Native clients authenticate per-request via Authorization: Bearer <jwt>.
  // The proxy's cookie-based getUser() doesn't see those, so it would 401
  // every native API call. Route handlers (getAuthedUser) validate the
  // Bearer token themselves.
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    request.headers.get("authorization")?.startsWith("Bearer ")
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // CRITICAL: do not place any code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (!user && !isPublicPath(pathname)) {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && needsOnboardingCheck(pathname)) {
    const { data: row, error: lookupError } = await supabase
      .from("users")
      .select("onboarding_complete")
      .eq("auth_id", user.id)
      .maybeSingle();
    if (lookupError) {
      console.warn("[proxy] onboarding lookup failed:", lookupError.message);
    }
    if (row && row.onboarding_complete === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Match every path except Next internals, static files, the service
    // worker, and image assets.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

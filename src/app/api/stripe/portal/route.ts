// POST /api/stripe/portal
// Body: none
//
// Auth: requires a signed-in Supabase Auth user.
// Returns: { url } — a Stripe Billing Portal URL the client redirects to.
// Errors with 409 if the user has never paid (no Stripe customer record yet).

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

function originFor(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const db = await createServerSupabase();
  const {
    data: { user: authUser },
  } = await db.auth.getUser();
  if (!authUser) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: me } = await db
    .from("users")
    .select("stripe_customer_id")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!me?.stripe_customer_id) {
    return Response.json({ error: "no_customer" }, { status: 409 });
  }

  const origin = originFor(req);
  const session = await stripeClient().billingPortal.sessions.create({
    customer: me.stripe_customer_id,
    return_url: `${origin}/home`,
  });

  return Response.json({ url: session.url });
}

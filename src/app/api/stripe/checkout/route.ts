// POST /api/stripe/checkout
// Body: { interval: "monthly" | "annual" }
//
// Auth: requires a signed-in Supabase Auth user (the proxy enforces this).
// Side effects: creates a Stripe Customer if the user does not yet have one,
//   persists the customer_id back to public.users, then creates a Checkout
//   Session in subscription mode and returns its URL for the client to
//   redirect to.

import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripeClient, priceIdFor, type StripeInterval } from "@/lib/stripe";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const interval = (body as { interval?: string } | null)?.interval;
  if (interval !== "monthly" && interval !== "annual") {
    return Response.json({ error: "invalid interval" }, { status: 400 });
  }

  const { data: me } = await db
    .from("users")
    .select("id, email, stripe_customer_id, subscription_status")
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (!me?.id) {
    return Response.json({ error: "user not provisioned" }, { status: 401 });
  }

  if (me.subscription_status === "pro") {
    return Response.json(
      { error: "already_subscribed" },
      { status: 409 },
    );
  }

  const stripe = stripeClient();

  // Ensure a Stripe customer exists for this user. Stored on public.users so
  // every subsequent checkout / portal call reuses it. Service role write —
  // bypasses RLS so we can update from a server route without trusting the
  // anon JWT for writes to billing columns.
  let customerId = me.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: me.email ?? authUser.email ?? undefined,
      metadata: { user_id: me.id, auth_id: authUser.id },
    });
    customerId = customer.id;
    await supabaseAdmin()
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", me.id);
  }

  const origin = originFor(req);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(interval as StripeInterval), quantity: 1 }],
    success_url: `${origin}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?status=cancelled`,
    allow_promotion_codes: true,
    client_reference_id: me.id,
    subscription_data: {
      metadata: { user_id: me.id, auth_id: authUser.id },
    },
  });

  if (!session.url) {
    return Response.json({ error: "no_url" }, { status: 500 });
  }
  return Response.json({ url: session.url });
}

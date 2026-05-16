// POST /api/stripe/webhook
//
// Public endpoint (whitelisted in src/proxy.ts) that Stripe calls to notify
// us of subscription lifecycle events. We MUST verify the signature against
// STRIPE_WEBHOOK_SECRET before doing anything else — otherwise an attacker
// can flip any user to `pro` for free.
//
// Side effects:
//   - checkout.session.completed → mark user pro, persist subscription_id,
//     stamp subscribed_at and subscription_period_end.
//   - customer.subscription.updated → refresh status + period_end. Maps
//     Stripe statuses to our four-value enum (free|pro|cancelled|past_due).
//   - customer.subscription.deleted → mark cancelled.
//   - invoice.payment_succeeded → defensive re-affirm pro + period_end on
//     each renewal.
//   - invoice.payment_failed → mark past_due (lets the existing free-tier
//     rate-limit kick back in, since /api/reid only skips it for `pro`).
//
// All DB writes go through the service-role client. RLS on public.users
// only allows the user themselves to update their row, and this handler is
// not running with their cookie.

import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeClient } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SubscriptionStatus } from "@/types/db";

export const runtime = "nodejs";

function mapStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "pro";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "incomplete":
    case "paused":
    default:
      return "free";
  }
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const itemPeriodEnd = sub.items?.data?.[0]?.current_period_end;
  const epoch = itemPeriodEnd ?? null;
  if (!epoch) return null;
  return new Date(epoch * 1000).toISOString();
}

async function updateByCustomer(
  customerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin()
    .from("users")
    .update(patch)
    .eq("stripe_customer_id", customerId);
}

async function handleSubscriptionEvent(sub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  await updateByCustomer(customerId, {
    subscription_status: mapStatus(sub.status),
    subscription_id: sub.id,
    subscription_period_end: periodEndIso(sub),
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return new Response("webhook secret missing", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("missing signature", { status: 400 });
  }

  // We need the raw body bytes — must not pass through req.json().
  const payload = await req.text();
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verification failed";
    console.error("[stripe/webhook] signature verification failed:", msg);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        if (!customerId) break;
        let periodEnd: string | null = null;
        let mappedStatus: SubscriptionStatus = "pro";
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            periodEnd = periodEndIso(sub);
            mappedStatus = mapStatus(sub.status);
          } catch (err) {
            console.error(
              "[stripe/webhook] could not retrieve subscription",
              err,
            );
          }
        }
        await updateByCustomer(customerId, {
          subscription_status: mappedStatus,
          subscription_id: subscriptionId,
          subscribed_at: new Date().toISOString(),
          subscription_period_end: periodEnd,
        });
        break;
      }
      case "customer.subscription.updated": {
        await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await updateByCustomer(customerId, {
          subscription_status: "cancelled",
          subscription_id: sub.id,
          subscription_period_end: periodEndIso(sub),
        });
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? null;
        if (!customerId) break;
        const subRef = invoice.parent?.subscription_details?.subscription ?? null;
        const subscriptionId =
          typeof subRef === "string" ? subRef : subRef?.id ?? null;
        let periodEnd: string | null = null;
        let mappedStatus: SubscriptionStatus = "pro";
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            periodEnd = periodEndIso(sub);
            mappedStatus = mapStatus(sub.status);
          } catch {
            // best-effort; fall through with defaults
          }
        }
        await updateByCustomer(customerId, {
          subscription_status: mappedStatus,
          ...(subscriptionId ? { subscription_id: subscriptionId } : {}),
          ...(periodEnd ? { subscription_period_end: periodEnd } : {}),
        });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id ?? null;
        if (!customerId) break;
        await updateByCustomer(customerId, {
          subscription_status: "past_due",
        });
        break;
      }
      default:
        // Ignore other event types — Stripe will mark the delivery
        // successful since we return 200.
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler failed:", err);
    return new Response("handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

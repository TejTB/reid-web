// Server-only Stripe client. Holds the secret key and must never be imported
// from a "use client" file. Use it only inside route handlers, server actions,
// or other server-only modules.

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function stripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("stripeClient: STRIPE_SECRET_KEY is missing");
  }
  // No apiVersion override — the SDK pins itself to its bundled version
  // (2026-04-22.dahlia for stripe@22.x).
  _stripe = new Stripe(key, { typescript: true });
  return _stripe;
}

export const STRIPE_PRICE_MONTHLY = "price_1TXllwRMW6MMaIVXczXkPXDh";
export const STRIPE_PRICE_ANNUAL = "price_1TXllYRMW6MMaIVXOMmy04WB";

export type StripeInterval = "monthly" | "annual";

export function priceIdFor(interval: StripeInterval): string {
  return interval === "annual" ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY;
}

export function intervalForPrice(priceId: string): StripeInterval | null {
  if (priceId === STRIPE_PRICE_MONTHLY) return "monthly";
  if (priceId === STRIPE_PRICE_ANNUAL) return "annual";
  return null;
}

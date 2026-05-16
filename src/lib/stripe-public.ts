// Client-safe Stripe metadata. No secrets here — just the price catalogue
// the pricing page and paywall modal render. Server-only price IDs live in
// `@/lib/stripe`.

export type PlanInterval = "monthly" | "annual";

export interface PlanCopy {
  interval: PlanInterval;
  label: string;
  priceLabel: string;
  cadence: string;
  caption: string;
}

export const PLAN_MONTHLY: PlanCopy = {
  interval: "monthly",
  label: "Monthly",
  priceLabel: "£29",
  cadence: "per month",
  caption: "Cancel anytime.",
};

export const PLAN_ANNUAL: PlanCopy = {
  interval: "annual",
  label: "Annual",
  priceLabel: "£229",
  cadence: "per year",
  caption: "Two months free.",
};

export const PLANS: PlanCopy[] = [PLAN_MONTHLY, PLAN_ANNUAL];

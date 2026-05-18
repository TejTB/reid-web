"use client";
import React from "react";
import { PlusIcon, ShieldCheckIcon } from "lucide-react";
import { BorderTrail } from "./border-trail";

// Side-by-side £29/mo and £229/yr plans for the PaywallModal. The Annual card
// gets the BorderTrail accent + "Save £119" pill. Selection is handler-driven
// because checkout URLs are minted server-side via POST /api/stripe/checkout
// — we never hold static URLs in the client.
interface PricingCardsProps {
  onSelectMonthly: () => void;
  onSelectAnnual: () => void;
  pending: "monthly" | "annual" | null;
}

export function PricingCards({
  onSelectMonthly,
  onSelectAnnual,
  pending,
}: PricingCardsProps) {
  const disabled = pending !== null;
  return (
    <div className="relative w-full">
      <div className="grid grid-cols-2 gap-0 bg-[#0a0a0a] relative border border-white/8 p-3">
        <PlusIcon className="absolute -top-3 -left-3 size-5 text-white/15" />
        <PlusIcon className="absolute -top-3 -right-3 size-5 text-white/15" />
        <PlusIcon className="absolute -bottom-3 -left-3 size-5 text-white/15" />
        <PlusIcon className="absolute -right-3 -bottom-3 size-5 text-white/15" />

        {/* Monthly */}
        <div className="w-full px-3 pt-4 pb-3 border-r border-white/6">
          <div className="space-y-0.5 mb-6">
            <h3 className="font-medium text-white text-sm font-sans">Monthly</h3>
            <p className="text-white/25 text-xs font-sans">Cancel anytime.</p>
          </div>
          <div className="flex items-end gap-0.5 text-white/40 text-base mb-4">
            <span className="mb-1">£</span>
            <span className="text-white text-4xl font-bold tracking-tighter leading-none">
              29
            </span>
            <span className="mb-0.5">/mo</span>
          </div>
          <button
            type="button"
            onClick={onSelectMonthly}
            disabled={disabled}
            className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:border-white/20 hover:text-white/70 transition-all font-sans disabled:opacity-50 disabled:cursor-default"
          >
            {pending === "monthly" ? "Opening checkout…" : "Continue"}
          </button>
        </div>

        {/* Annual */}
        <div className="relative w-full px-3 pt-4 pb-3 rounded-lg border border-[#B91C1C]/30 overflow-hidden bg-[#0f0a0a]">
          <BorderTrail />
          <div className="space-y-0.5 mb-6 relative z-10">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-white text-sm font-sans">Annual</h3>
              <span className="text-xs bg-green-900/30 text-green-400 border border-green-800/40 px-1.5 py-0.5 rounded-full font-sans">
                Save £119
              </span>
            </div>
            <p className="text-white/25 text-xs font-sans">Two months free.</p>
          </div>
          <div className="flex items-end gap-0.5 text-white/40 text-base mb-4 relative z-10">
            <span className="mb-1">£</span>
            <span className="text-white text-4xl font-bold tracking-tighter leading-none">
              229
            </span>
            <span className="mb-0.5">/yr</span>
          </div>
          <button
            type="button"
            onClick={onSelectAnnual}
            disabled={disabled}
            className="w-full py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991818] text-white text-xs transition-all font-sans relative z-10 disabled:opacity-60 disabled:cursor-default"
          >
            {pending === "annual" ? "Opening checkout…" : "Continue"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-white/20 text-xs mt-3 font-sans">
        <ShieldCheckIcon className="size-3" />
        <span>Checkout in browser. Pro unlocks automatically.</span>
      </div>
    </div>
  );
}

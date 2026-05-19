// Shared badge mapping for observation rows. Both the /observations list
// tile AND the FullScreenCard MUST render badges from this single source —
// before Sprint 11 the tile could read `confidence` as a fallback (producing
// "Warning") while the FullScreenCard only read `category` (producing
// "Observation"), so the same row showed different badges depending on the
// surface. Driving everything from `observations.category` here keeps them
// in sync.
//
// Palette mirrors the sprint11.md design intent (red/amber/blue/grey),
// mapped onto the actual DB enum
// (`avoidance | pattern | contradiction | strength`):
//
//   contradiction → the "warning" slot     (red)
//   pattern       → the "pattern" slot     (amber)
//   strength      → the "info" slot        (blue)
//   avoidance     → default observation    (grey)

import type { ObservationCategory } from "@/types/db";

export type ObservationBadge = {
  bg: string;
  fg: string;
  label: string;
};

export function observationBadge(
  category: ObservationCategory | string | null | undefined,
): ObservationBadge {
  const c = (category ?? "").toLowerCase();
  if (c === "contradiction") {
    return { bg: "#B91C1C", fg: "#F2EDE3", label: "Contradiction" };
  }
  if (c === "pattern") {
    return {
      bg: "rgba(217,119,6,0.9)",
      fg: "#F2EDE3",
      label: "Pattern",
    };
  }
  if (c === "strength") {
    return {
      bg: "rgba(37,99,235,0.9)",
      fg: "#F2EDE3",
      label: "Strength",
    };
  }
  if (c === "avoidance") {
    return {
      bg: "rgba(100,116,139,0.5)",
      fg: "#C8D5E3",
      label: "Avoidance",
    };
  }
  return {
    bg: "rgba(100,116,139,0.5)",
    fg: "#C8D5E3",
    label: "Observation",
  };
}

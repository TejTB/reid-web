// Universal constants for the session subsystem.
//
// Lives outside session.ts (which is "use client") so server routes can import
// the free-tier session quota without dragging the browser-only supabase
// client onto the server.

// Sprint 12 entitlement allowance. The number of message-bearing,
// non-onboarding ("real") sessions a free user may have BEFORE the wall. The
// funnel is: onboarding (exempt) → session 1 free (seeds the memory) →
// session 2 free (the memory callback fires — the magic moment) → wall at
// session 3, while desire is peaking. Lifetime, not monthly — a trial→Pro
// funnel, not a recurring free tier. Tunable later (per-session turn cap is the
// future lever if cost spikes). This is the SINGLE source consumed by
// getEntitlement — which both /api/reid and /api/tts honour for authorization —
// and the same value the display surfaces show via the entitlement seam, so
// what the user sees always equals what is enforced.
export const FREE_SESSION_ALLOWANCE = 2 as const;

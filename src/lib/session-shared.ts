// Universal constants for the session subsystem.
//
// Lives outside session.ts (which is "use client") so server routes can import
// the free-tier session quota without dragging the browser-only supabase
// client onto the server.

// LEGACY monthly counter quota. Still read by the six client surfaces
// (chat/home/settings/AppShell/SettingsModal/push-message) and by the legacy
// `users.sessions_used_this_month` display path. Sprint 12 Build 3 repoints
// those readers to the entitlement seam and retires this; until then it stays
// at 5 so the still-live legacy display is unchanged.
export const FREE_SESSIONS = 5 as const;

// Sprint 12 entitlement allowance. The number of message-bearing,
// non-onboarding ("real") sessions a free user may have BEFORE the wall. The
// funnel is: onboarding (exempt) → session 1 (the memory callback, free) →
// wall at session 2. Lifetime, not monthly — this is a trial→Pro funnel, not a
// recurring free tier. Tunable later (per-session turn cap is the future lever
// if cost spikes). This is the SINGLE source consumed by getEntitlement, which
// both /api/reid (402) and /api/tts (403) honour.
export const FREE_SESSION_ALLOWANCE = 1 as const;

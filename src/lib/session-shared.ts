// Universal constants for the session subsystem.
//
// Lives outside session.ts (which is "use client") so server routes can import
// the free-tier session quota without dragging the browser-only supabase
// client onto the server.

export const FREE_SESSIONS = 5 as const;

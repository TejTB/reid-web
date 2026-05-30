import { test } from "node:test";
import assert from "node:assert/strict";
import { getEntitlement } from "../entitlement.ts";
import { FREE_SESSION_ALLOWANCE } from "../session-shared.ts";

// ---------------------------------------------------------------------------
// Fake SupabaseClient.
//
// getEntitlement makes at most two reads against the request-scoped (RLS)
// client:
//   1. users    → { id, subscription_status }  filtered by auth_id
//   2. sessions → COUNT(*) with head:true, filtered by user_id + mode +
//      message_count, and (conditionally) id <> excludeSessionId
//
// The fake records the sessions-query filter chain so each test can assert the
// exact predicates applied (the NULL-safe exclusion is the critical one) and
// returns a controlled count. Pro short-circuits before the sessions read.
// ---------------------------------------------------------------------------

interface FakeState {
  neqCalls: Array<[string, unknown]>;
  eqCalls: Array<[string, unknown]>;
  gtCalls: Array<[string, unknown]>;
  sessionsQueried: boolean;
}

function makeClient(opts: {
  userRow: { id: string; subscription_status: string | null } | null;
  sessionCount: number;
}) {
  const state: FakeState = {
    neqCalls: [],
    eqCalls: [],
    gtCalls: [],
    sessionsQueried: false,
  };

  const usersBuilder = {
    select: () => usersBuilder,
    eq: () => usersBuilder,
    maybeSingle: async () => ({ data: opts.userRow, error: null }),
  };

  // Thenable count builder: awaiting it resolves to { count, error }. Every
  // filter returns the builder for chaining.
  const sessionsBuilder: Record<string, unknown> = {
    select: () => {
      state.sessionsQueried = true;
      return sessionsBuilder;
    },
    eq: (col: string, val: unknown) => {
      state.eqCalls.push([col, val]);
      return sessionsBuilder;
    },
    neq: (col: string, val: unknown) => {
      state.neqCalls.push([col, val]);
      return sessionsBuilder;
    },
    gt: (col: string, val: unknown) => {
      state.gtCalls.push([col, val]);
      return sessionsBuilder;
    },
    then: (resolve: (v: { count: number; error: null }) => unknown) =>
      resolve({ count: opts.sessionCount, error: null }),
  };

  const client = {
    from: (table: string) => {
      if (table === "users") return usersBuilder;
      if (table === "sessions") return sessionsBuilder;
      throw new Error(`unexpected table ${table}`);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, state };
}

const AUTH_ID = "auth-uuid-1";
const USER_ID = "user-uuid-1";

test("Pro bypasses the count entirely (entitled regardless of usage, never reads sessions)", async () => {
  const { client, state } = makeClient({
    userRow: { id: USER_ID, subscription_status: "pro" },
    sessionCount: 999,
  });
  const r = await getEntitlement(client, AUTH_ID);
  assert.equal(r.isPro, true);
  assert.equal(r.entitled, true);
  assert.equal(r.allowance, FREE_SESSION_ALLOWANCE);
  assert.equal(state.sessionsQueried, false);
});

test("free user UNDER allowance is entitled (0 used, allowance 1)", async () => {
  const { client } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 0,
  });
  const r = await getEntitlement(client, AUTH_ID);
  assert.equal(r.isPro, false);
  assert.equal(r.sessionsUsed, 0);
  assert.equal(r.entitled, true);
});

test("free user AT allowance is walled (1 used, allowance 1)", async () => {
  const { client } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 1,
  });
  const r = await getEntitlement(client, AUTH_ID);
  assert.equal(r.entitled, false);
  assert.equal(r.sessionsUsed, 1);
});

test("null subscription_status is treated as free", async () => {
  const { client } = makeClient({
    userRow: { id: USER_ID, subscription_status: null },
    sessionCount: 1,
  });
  const r = await getEntitlement(client, AUTH_ID);
  assert.equal(r.isPro, false);
  assert.equal(r.entitled, false);
});

test("COUNT is filtered to non-onboarding, message-bearing sessions for this user", async () => {
  const { client, state } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 0,
  });
  await getEntitlement(client, AUTH_ID);
  assert.deepEqual(
    state.eqCalls.find(([c]) => c === "user_id"),
    ["user_id", USER_ID],
  );
  assert.ok(state.neqCalls.some(([c, v]) => c === "mode" && v === "onboarding"));
  assert.ok(state.gtCalls.some(([c, v]) => c === "message_count" && v === 0));
});

// ---- CRITICAL: NULL-safe exclusion -------------------------------------
test("with NO excludeSessionId applies NO id-exclusion AND still walls at allowance", async () => {
  const { client, state } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 1,
  });
  const r = await getEntitlement(client, AUTH_ID);
  // No `id <> NULL` — that matches no rows in SQL, zeroing the count and
  // failing the gate OPEN. This covers the /api/reid 402 path and native.
  assert.equal(
    state.neqCalls.filter(([c]) => c === "id").length,
    0,
    "must not apply an id exclusion when excludeSessionId is absent",
  );
  assert.equal(r.sessionsUsed, 1);
  assert.equal(r.entitled, false);
});

test("with excludeSessionId applies id<>that-session (self-count fix, /api/tts path)", async () => {
  const { client, state } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 0,
  });
  await getEntitlement(client, AUTH_ID, { excludeSessionId: "current-session" });
  assert.ok(
    state.neqCalls.some(([c, v]) => c === "id" && v === "current-session"),
  );
});

test("first session in progress does NOT wall itself (excluded from the count)", async () => {
  // The user's only real session is the one they're in; with it excluded the
  // effective count is 0 → still entitled (allowance 1).
  const { client } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 0, // count AFTER excluding the current session
  });
  const r = await getEntitlement(client, AUTH_ID, {
    excludeSessionId: "current-session",
  });
  assert.equal(r.entitled, true);
  assert.equal(r.sessionsUsed, 0);
});

test("null excludeSessionId behaves the same as absent (no id exclusion)", async () => {
  const { client, state } = makeClient({
    userRow: { id: USER_ID, subscription_status: "free" },
    sessionCount: 1,
  });
  const r = await getEntitlement(client, AUTH_ID, { excludeSessionId: null });
  assert.equal(state.neqCalls.filter(([c]) => c === "id").length, 0);
  assert.equal(r.entitled, false);
});

test("unprovisioned user (no users row) is not entitled and not pro", async () => {
  const { client } = makeClient({ userRow: null, sessionCount: 0 });
  const r = await getEntitlement(client, AUTH_ID);
  assert.equal(r.isPro, false);
  assert.equal(r.entitled, false);
  assert.equal(r.userId, null);
});

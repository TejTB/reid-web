// GET /api/push/vapid
//
// Returns the VAPID public key the client needs to register a
// PushManager subscription. We expose this via an endpoint (rather than
// inlining NEXT_PUBLIC_VAPID_PUBLIC_KEY in the client bundle) so the value
// can be rotated without redeploying static assets.
//
// If the env var is missing we return `{ publicKey: null }` with HTTP 200 —
// the client treats `null` as "push not configured" and silently disables
// the opt-in flow. A 500 would mask the real issue.

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return Response.json(
    { publicKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { Redis } from "@upstash/redis";

// Vercel Marketplace KV exposes the Upstash credentials under the `KV_*`
// names; the @upstash/redis SDK looks for `UPSTASH_*` by default. We accept
// either set so it works in both environments without renaming env vars.
const url =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

// In local dev the KV credentials are often empty (only set on Vercel). The
// @upstash/redis client constructor accepts empty strings but every call
// rejects with `Failed to parse URL from /pipeline`. Detecting that here
// means rate-limited endpoints (login, signup, /api/reid) don't 500 in dev.
// Production always has real credentials, so this branch is dead there.
const REDIS_CONFIGURED = url.length > 0 && token.length > 0;

const redis = new Redis({
  url,
  token,
});

const FREE_TIER_DAILY_LIMIT = 20;

export async function checkDailyMessageLimit(userId: string) {
  if (!REDIS_CONFIGURED) {
    return { allowed: true, remaining: FREE_TIER_DAILY_LIMIT, used: 0 };
  }
  const dayKey = new Date().toISOString().slice(0, 10);
  const key = `reid:rl:msg:${userId}:${dayKey}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 60 * 60 * 25);
  return {
    allowed: used <= FREE_TIER_DAILY_LIMIT,
    remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - used),
    used,
  };
}

/** 5 failed-or-attempted logins per email per 15 minutes. */
export async function checkLoginRateLimit(emailLower: string): Promise<{
  allowed: boolean;
  retryAfter: number;
}> {
  if (!REDIS_CONFIGURED) return { allowed: true, retryAfter: 0 };
  const windowSec = 15 * 60;
  const key = `reid:rl:login:${emailLower}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 5) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

export async function resetLoginRateLimit(emailLower: string): Promise<void> {
  if (!REDIS_CONFIGURED) return;
  await redis.del(`reid:rl:login:${emailLower}`);
}

/** 8 Reid messages per user per 60s — burst protection on top of the
 *  daily quota in checkDailyMessageLimit. */
export async function checkReidMinuteLimit(userId: string): Promise<{
  allowed: boolean;
  retryAfter: number;
}> {
  if (!REDIS_CONFIGURED) return { allowed: true, retryAfter: 0 };
  const windowSec = 60;
  const key = `reid:rl:minute:${userId}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 8) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

// ----- Voice route limits (transcribe + tts) -------------------------------
//
// Per-user, per-route sliding window over the last hour. Free users get 20
// calls/hour/route; Pro users 60. Implemented as a Redis sorted-set log (one
// entry per call, scored by timestamp) so the window truly slides rather than
// resetting on a fixed boundary. Reuses the same @upstash/redis client and
// REDIS_CONFIGURED guard as the limiters above.

const VOICE_HOURLY_LIMIT_FREE = 20;
const VOICE_HOURLY_LIMIT_PRO = 60;

export type VoiceRoute = "transcribe" | "tts";

/** Hourly call limit for a subscription_status. "pro" -> 60, anything else -> 20. */
export function hourlyLimitFor(status: string | null | undefined): number {
  return status === "pro" ? VOICE_HOURLY_LIMIT_PRO : VOICE_HOURLY_LIMIT_FREE;
}

async function checkSlidingWindow(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; retryAfter: number; remaining: number }> {
  if (!REDIS_CONFIGURED) {
    return { allowed: true, retryAfter: 0, remaining: limit };
  }
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  // Atomic: drop expired entries, log this call, count the window, refresh TTL.
  const pipe = redis.multi();
  pipe.zremrangebyscore(key, 0, now - windowMs);
  pipe.zadd(key, { score: now, member });
  pipe.zcard(key);
  pipe.expire(key, windowSec);
  const res = (await pipe.exec()) as unknown[];
  // pipeline result order: [0] zremrangebyscore, [1] zadd, [2] zcard, [3] expire
  const count = Number(res[2] ?? 0);

  if (count <= limit) {
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, limit - count) };
  }

  // Over the limit: remove the attempt we just logged so repeated blocked calls
  // don't keep extending the window, then report when the oldest call ages out.
  await redis.zrem(key, member);
  // @upstash/redis returns withScores as a flat [member, score, ...] array
  const oldest = (await redis.zrange(key, 0, 0, { withScores: true })) as (
    | string
    | number
  )[];
  let retryAfter = windowSec;
  if (oldest.length >= 2) {
    const oldestScore = Number(oldest[1]);
    retryAfter = Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000));
  }
  return { allowed: false, retryAfter, remaining: 0 };
}

/** Sliding-window rate limit for the voice routes, keyed per user + route. */
export async function checkVoiceRouteLimit(
  route: VoiceRoute,
  userId: string,
  status: string | null | undefined,
): Promise<{ allowed: boolean; retryAfter: number; remaining: number }> {
  return checkSlidingWindow(
    `reid:rl:voice:${route}:${userId}`,
    hourlyLimitFor(status),
    60 * 60,
  );
}

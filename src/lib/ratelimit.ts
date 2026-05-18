import { Redis } from "@upstash/redis";

// Vercel Marketplace KV exposes the Upstash credentials under the `KV_*`
// names; the @upstash/redis SDK looks for `UPSTASH_*` by default. We accept
// either set so it works in both environments without renaming env vars.
const url =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = new Redis({
  url: url ?? "",
  token: token ?? "",
});

const FREE_TIER_DAILY_LIMIT = 20;

export async function checkDailyMessageLimit(userId: string) {
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
  const windowSec = 15 * 60;
  const key = `reid:rl:login:${emailLower}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 5) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

export async function resetLoginRateLimit(emailLower: string): Promise<void> {
  await redis.del(`reid:rl:login:${emailLower}`);
}

/** 8 Reid messages per user per 60s — burst protection on top of the
 *  daily quota in checkDailyMessageLimit. */
export async function checkReidMinuteLimit(userId: string): Promise<{
  allowed: boolean;
  retryAfter: number;
}> {
  const windowSec = 60;
  const key = `reid:rl:minute:${userId}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= 8) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

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

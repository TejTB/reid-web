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

/** Fixed-window counter on a Redis key: INCR, set the TTL on the first hit of
 *  the window, allow while count <= max. Returns retryAfter (the key's
 *  remaining TTL) when over the limit so callers can surface an honest wait.
 *  Shared by the conversational and voice minute limiters below. */
async function incrLimit(
  key: string,
  windowSec: number,
  max: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (!REDIS_CONFIGURED) return { allowed: true, retryAfter: 0 };
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, windowSec);
  if (used <= max) return { allowed: true, retryAfter: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSec };
}

/** 20 Reid conversational turns per user per 60s — burst protection on the
 *  text/chat path (/api/reid). The voice sub-calls (/api/transcribe, /api/tts)
 *  use a SEPARATE bucket (checkVoiceMinuteLimit) so one spoken turn's audio
 *  hops don't drain the conversational budget. */
export async function checkReidMinuteLimit(userId: string) {
  return incrLimit(`reid:rl:minute:${userId}`, 60, 20);
}

/** 30 voice sub-calls per user per 60s — shared by /api/transcribe + /api/tts.
 *  One spoken turn = 1 transcribe + 1 tts = 2 hits, so 30 ≈ 15 voice turns/min:
 *  well above human spoken cadence while still capping the Whisper/ElevenLabs
 *  cost+abuse surface. Decoupled from the conversational minute key so text and
 *  voice in the same minute never starve each other. */
export async function checkVoiceMinuteLimit(userId: string) {
  return incrLimit(`reid:rl:voice:${userId}`, 60, 30);
}

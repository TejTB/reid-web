import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ElevenLabsClient } from "elevenlabs";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { getAuthedUser } from "@/lib/supabase-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Reid's ElevenLabs voice. Pinned to a single id so the brand voice never
// drifts. Output is mp3_44100_128 (the SDK's default) — adequate for chat
// playback and small enough to cache cheaply in Upstash.
const VOICE_ID = "gXoaQmnIbECYarWwg7B2";

// Words returned for a `preview: true` request. Free users get this short
// taste before the upgrade modal opens; the prompt is identical across Pro
// and free for cache reuse.
const PREVIEW_WORD_COUNT = 12;

// 24h cache — Reid messages are not user-specific text, they're model output
// keyed by raw bytes, so MD5(finalText) collisions are functionally impossible
// at our scale and the ElevenLabs cost saving is large for repeated chunks.
const CACHE_TTL_SECONDS = 60 * 60 * 24;

const Schema = z.object({
  text: z.string().min(1).max(4000),
  preview: z.boolean().optional(),
});

// Accept either Vercel Marketplace KV (KV_REST_API_*) or upstream Upstash
// names. Mirrors src/lib/ratelimit.ts so deployments don't need to rename
// env vars.
const redisUrl =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = new Redis({
  url: redisUrl ?? "",
  token: redisToken ?? "",
});

// Strip markdown decoration so the voice doesn't pronounce asterisks, hashes,
// or quote marks. Matches the cleanup in the old /api/voice route plus the
// quote strip the spec calls for.
function cleanForSpeech(raw: string): string {
  return raw
    .replace(/\*+/g, "")
    .replace(/#+\s/g, "")
    .replace(/`+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/["“”]/g, "")
    .trim();
}

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = authed.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { text, preview = false } = parsed.data;

  // Gate full playback on Pro. Free users can request a preview (12 words)
  // unlimited times so the cache absorbs the cost; full-length text is
  // Pro-only and matches the behaviour of the previous /api/voice route.
  const admin = supabaseAdmin();
  const { data: appUser } = await admin
    .from("users")
    .select("subscription_status")
    .eq("auth_id", user.id)
    .maybeSingle();
  const isPro = appUser?.subscription_status === "pro";
  if (!preview && !isPro) {
    return NextResponse.json({ error: "reid_pro_required" }, { status: 403 });
  }

  const cleaned = cleanForSpeech(text);
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }
  const finalText = preview
    ? cleaned.split(/\s+/).slice(0, PREVIEW_WORD_COUNT).join(" ")
    : cleaned;

  const cacheKey = `tts:${createHash("md5").update(finalText).digest("hex")}`;

  let cached: string | null = null;
  try {
    cached = await redis.get<string>(cacheKey);
  } catch {
    // Redis miss/error is non-fatal — fall through to ElevenLabs.
  }
  if (cached) {
    const buffer = Buffer.from(cached, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
        "X-Reid-TTS-Cache": "hit",
      },
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
  const client = new ElevenLabsClient({ apiKey });

  let buffer: Buffer;
  try {
    const audioStream = await client.textToSpeech.convert(VOICE_ID, {
      text: finalText,
      model_id: "eleven_turbo_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.3,
      },
    });
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
    buffer = Buffer.concat(chunks);
  } catch {
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }

  try {
    await redis.set(cacheKey, buffer.toString("base64"), {
      ex: CACHE_TTL_SECONDS,
    });
  } catch {
    // Best-effort cache write.
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "no-store",
      "X-Reid-TTS-Cache": "miss",
    },
  });
}

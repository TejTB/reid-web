import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { getAuthedUser } from "@/lib/supabase-auth";
import { checkVoiceMinuteLimit } from "@/lib/ratelimit";
import { voiceCapApplies } from "@/lib/cap-policy";

// Speech-to-text for the native voice loop. The native client records an
// .m4a clip and POSTs it here as multipart/form-data (field "file"); we hand
// it to Whisper and return { transcript }.
//
// language:"en" is REQUIRED, not optional: without it Whisper auto-detects
// language and reliably hallucinates Korean/Japanese on short or quiet English
// clips. Reid is English-only for now, so we pin it.
export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "whisper-1";
// Whisper's hard upload ceiling is 25 MB. A 30s HIGH_QUALITY m4a is well under
// this; reject anything larger so we fail fast instead of 413-ing at OpenAI.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  // Burst protection on the dedicated VOICE bucket (30/min/user), shared only
  // with /api/tts — NOT the conversational /api/reid key. Transcription is the
  // first hop of every spoken turn; keeping it off the chat budget means a
  // voice turn's audio hops can't 429 the founder's next typed message.
  //
  // Pro and onboarding sessions are exempt (parity with /api/reid + /api/tts).
  // Server-derived: subscription_status and the session's mode are read from the
  // real rows under RLS (the request-scoped client only sees the caller's own
  // rows). A missing / unparseable / unowned sessionId leaves sessionMode null,
  // which CAPS — never a bypass.
  const sessionIdRaw = form.get("sessionId");
  const sessionId =
    typeof sessionIdRaw === "string" && sessionIdRaw.length > 0
      ? sessionIdRaw
      : null;

  const { data: meRow } = await authed.supabase
    .from("users")
    .select("subscription_status")
    .eq("auth_id", authed.user.id)
    .maybeSingle();
  const isPro = (meRow?.subscription_status as string | null) === "pro";

  let sessionMode: string | null = null;
  if (sessionId) {
    const { data: sessionRow } = await authed.supabase
      .from("sessions")
      .select("mode")
      .eq("id", sessionId)
      .maybeSingle();
    sessionMode = (sessionRow?.mode as string | null) ?? null;
  }

  if (voiceCapApplies({ isPro, sessionMode })) {
    const limit = await checkVoiceMinuteLimit(authed.user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "missing audio file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio too large" }, { status: 413 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "stt_unavailable" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  try {
    const upload = await toFile(file, "speech.m4a", { type: "audio/m4a" });
    const result = await client.audio.transcriptions.create({
      file: upload,
      model: MODEL,
      language: "en",
      response_format: "json",
    });
    return NextResponse.json({ transcript: result.text ?? "" });
  } catch {
    return NextResponse.json({ error: "transcribe_failed" }, { status: 502 });
  }
}

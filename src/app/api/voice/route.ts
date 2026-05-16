import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ElevenLabsClient } from "elevenlabs";
import { z } from "zod";

const VOICE_ID = "gXoaQmnIbECYarWwg7B2";
const Schema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: NextRequest) {
  const db = await createServerSupabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: appUser } = await admin
    .from("users")
    .select("subscription_status")
    .eq("auth_id", user.id)
    .single();

  if (!appUser || appUser.subscription_status !== "pro") {
    return NextResponse.json({ error: "Reid Pro required" }, { status: 403 });
  }

  const body = Schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const clean = body.data.text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .trim();

  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

  const audioStream = await client.textToSpeech.convert(VOICE_ID, {
    text: clean,
    model_id: "eleven_turbo_v2_5",
    voice_settings: {
      stability: 0.75,
      similarity_boost: 0.85,
      style: 0.15,
      use_speaker_boost: true,
    },
    output_format: "mp3_44100_128",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "no-store",
    },
  });
}

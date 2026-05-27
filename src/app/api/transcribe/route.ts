import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";
import { validateAudioFile } from "@/lib/transcribe";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export async function POST(req: NextRequest) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "transcribe_unavailable" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_audio" }, { status: 400 });
  }

  const file = form.get("file");
  const check = validateAudioFile(file);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const audio = file as File;

  const oaForm = new FormData();
  oaForm.append("file", audio, audio.name || "audio.m4a");
  oaForm.append("model", "whisper-1");

  try {
    const res = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: oaForm,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[api/transcribe] whisper failed:", res.status, detail);
      return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ transcript: (data.text ?? "").trim() });
  } catch (err) {
    console.error("[api/transcribe] request error:", err);
    return NextResponse.json({ error: "transcription_failed" }, { status: 502 });
  }
}

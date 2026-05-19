import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase-auth";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  const authed = await getAuthedUser(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, supabase } = authed;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  // Path must start with the auth user id — RLS enforces this on storage.objects.
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/avatar.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "0",
    });
  if (uploadErr) {
    console.error("[api/avatar/upload] storage upload failed:", uploadErr);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const { data: publicUrl } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);
  // Cache-bust so the avatar refreshes after re-upload.
  const avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

  const { data: meRow } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (meRow?.id) {
    await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", meRow.id);
  }

  return NextResponse.json({ avatarUrl });
}

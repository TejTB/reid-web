import { supabaseAdmin } from "./supabase-admin";
import { isPlausibleFirstName } from "./reid-summary";

export async function ensureUserRow(
  authId: string,
  email: string | null,
  name?: string | null,
): Promise<void> {
  const admin = supabaseAdmin();
  const firstToken = name?.trim().split(/\s+/)[0] ?? null;
  const cleanName =
    firstToken && isPlausibleFirstName(firstToken) ? firstToken : null;

  const { data: byAuth } = await admin
    .from("users")
    .select("id, name")
    .eq("auth_id", authId)
    .maybeSingle();
  if (byAuth) {
    if (cleanName && !byAuth.name) {
      await admin.from("users").update({ name: cleanName }).eq("id", byAuth.id);
    }
    return;
  }

  if (email) {
    const { data: byEmail } = await admin
      .from("users")
      .select("id, name")
      .eq("email", email)
      .maybeSingle();
    if (byEmail) {
      const update: { auth_id: string; name?: string } = { auth_id: authId };
      if (cleanName && !byEmail.name) update.name = cleanName;
      await admin.from("users").update(update).eq("id", byEmail.id);
      return;
    }
  }

  await admin.from("users").insert({
    auth_id: authId,
    email,
    name: cleanName,
    onboarding_complete: false,
  });
}

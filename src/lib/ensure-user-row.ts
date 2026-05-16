import { supabaseAdmin } from "./supabase-admin";

export async function ensureUserRow(authId: string, email: string | null): Promise<void> {
  const admin = supabaseAdmin();

  const { data: byAuth } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();
  if (byAuth) return;

  if (email) {
    const { data: byEmail } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (byEmail) {
      await admin.from("users").update({ auth_id: authId }).eq("id", byEmail.id);
      return;
    }
  }

  await admin.from("users").insert({
    auth_id: authId,
    email,
    onboarding_complete: false,
  });
}

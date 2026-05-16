import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export default async function RootPage() {
  const db = await createServerSupabase();
  const {
    data: { user: authUser },
  } = await db.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  const { data: me } = await db
    .from("users")
    .select("id, onboarding_complete")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  if (!me || me.onboarding_complete === false) {
    redirect("/onboarding");
  }
  redirect("/home");
}

import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, quota_bytes, used_bytes")
    .eq("id", user!.id)
    .single();

  return <DashboardClient profile={profile!} />;
}

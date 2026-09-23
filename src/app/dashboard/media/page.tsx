import { createClient } from "@/lib/supabase/server";
import MediaClient from "./MediaClient";

export default async function MediaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, quota_bytes, used_bytes")
    .eq("id", user!.id)
    .single();

  return <MediaClient profile={profile!} />;
}

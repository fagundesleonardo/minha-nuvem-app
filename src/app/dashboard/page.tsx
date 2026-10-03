import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Belt-and-suspenders: proxy.ts already redirects signed-out visitors
  // away from /dashboard, but if this ever renders without a session
  // (e.g. a stale cookie on the very first request after sign-up) bounce
  // to /login instead of crashing on a null user.
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, quota_bytes, used_bytes")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return <DashboardClient profile={profile} />;
}

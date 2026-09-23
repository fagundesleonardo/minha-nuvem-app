import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, status, plan_id, quota_bytes, used_bytes, notes, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ users: data });
}

import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Defense-in-depth on top of RLS (cloudapp.is_admin() already restricts the
 * underlying rows): every /api/admin/* route also checks the caller's role
 * explicitly so a bug in a query never silently returns someone else's data
 * to a non-admin — it 403s instead.
 */
export async function requireAdmin(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  }

  return { user } as const;
}

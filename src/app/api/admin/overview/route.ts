import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const [{ count: userCount }, { count: suspendedCount }, { count: fileCount }, { count: folderCount }, { data: profiles }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      supabase.from("files").select("id", { count: "exact", head: true }).eq("status", "ready"),
      supabase.from("folders").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("used_bytes, quota_bytes"),
    ]);

  const totalUsed = (profiles ?? []).reduce((sum, p) => sum + (p.used_bytes ?? 0), 0);
  const totalQuota = (profiles ?? []).reduce((sum, p) => sum + (p.quota_bytes ?? 0), 0);

  return NextResponse.json({
    userCount: userCount ?? 0,
    suspendedCount: suspendedCount ?? 0,
    fileCount: fileCount ?? 0,
    folderCount: folderCount ?? 0,
    totalUsedBytes: totalUsed,
    totalQuotaBytes: totalQuota,
  });
}

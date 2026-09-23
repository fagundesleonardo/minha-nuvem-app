import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.role === "user" || body.role === "admin") {
    if (id === auth.user.id && body.role !== "admin") {
      return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
    }
    update.role = body.role;
  }
  if (body.status === "active" || body.status === "suspended") {
    if (id === auth.user.id && body.status === "suspended") {
      return NextResponse.json({ error: "cannot_suspend_self" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (typeof body.quotaBytes === "number" && body.quotaBytes >= 0) update.quota_bytes = body.quotaBytes;
  if ("planId" in body) update.plan_id = body.planId || null;
  if (typeof body.notes === "string") update.notes = body.notes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

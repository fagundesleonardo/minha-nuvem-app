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
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.quotaBytes === "number" && body.quotaBytes > 0) update.quota_bytes = body.quotaBytes;
  if ("priceCents" in body) update.price_cents = body.priceCents;
  if ("description" in body) update.description = body.description;

  const { error } = await supabase.from("plans").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  // Don't orphan users silently — unassign the plan (falls back to their
  // current quota_bytes) instead of leaving a dangling reference.
  await supabase.from("profiles").update({ plan_id: null }).eq("plan_id", id);
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase.from("plans").select("*").order("quota_bytes", { ascending: true });
  if (error) return NextResponse.json({ error: "load_failed" }, { status: 500 });
  return NextResponse.json({ plans: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const { name, quotaBytes, priceCents, description } = await req.json();
  if (!name || typeof quotaBytes !== "number" || quotaBytes <= 0) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({ name, quota_bytes: quotaBytes, price_cents: priceCents ?? null, description: description ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });
  return NextResponse.json({ plan: data });
}

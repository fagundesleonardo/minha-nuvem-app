import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Step 2 of an upload: the browser confirms the direct-to-R2 PUT
// succeeded, so we flip the file row from "pending" to "ready".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("files")
    .update({ status: "ready" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

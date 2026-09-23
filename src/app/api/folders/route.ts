import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, parentId } = await req.json();
  if (!name || typeof name !== "string") return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const { data, error } = await supabase
    .from("folders")
    .insert({ owner_id: user.id, parent_id: parentId ?? null, name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Já existe uma pasta com esse nome aqui." }, { status: 409 });
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { r2, R2_BUCKET } from "@/lib/r2";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name;
  if ("folderId" in body) update.folder_id = body.folderId;

  const { error } = await supabase.from("files").update(update).eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar (nome já existe na pasta?)" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: file } = await supabase.from("files").select("r2_key, owner_id").eq("id", id).single();
  if (!file || file.owner_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: file.r2_key }));
  await supabase.from("files").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}

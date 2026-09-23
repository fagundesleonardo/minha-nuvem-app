import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
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
  if ("parentId" in body) update.parent_id = body.parentId;

  const { error } = await supabase.from("folders").update(update).eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a pasta." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

// Recursively deletes a folder: every file inside (and inside its
// sub-folders) gets removed from R2 too, not just the DB rows.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: folder } = await supabase.from("folders").select("owner_id").eq("id", id).single();
  if (!folder || folder.owner_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Walk the subtree in application code (Postgres RLS + a recursive CTE
  // via supabase-js would need an RPC; this keeps it simple for v1).
  const folderIds = [id];
  for (let i = 0; i < folderIds.length; i++) {
    const { data: children } = await supabase.from("folders").select("id").eq("parent_id", folderIds[i]);
    for (const c of children ?? []) folderIds.push(c.id);
  }

  const { data: files } = await supabase.from("files").select("id, r2_key").in("folder_id", folderIds);
  if (files && files.length > 0) {
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: files.map((f) => ({ Key: f.r2_key })) },
      })
    );
  }

  await supabase.from("folders").delete().eq("id", id); // cascades files + sub-folders
  return NextResponse.json({ ok: true });
}

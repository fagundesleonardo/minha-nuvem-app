import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2, R2_BUCKET, makeR2Key } from "@/lib/r2";

// Step 1 of an upload: the browser tells us what it's about to send, we
// create a "pending" file row + quota-check it, and hand back a
// presigned R2 PUT URL. The actual bytes then go browser -> R2 directly,
// never through this server — this is what fixes the old Nextcloud
// setup's broken/crawling uploads.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, size, mimeType, folderId } = await req.json();
  if (!name || typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("quota_bytes, used_bytes, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status === "suspended") {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }
  if (profile.used_bytes + size > profile.quota_bytes) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 413 });
  }

  const { data: file, error: insertError } = await supabase
    .from("files")
    .insert({
      owner_id: user.id,
      folder_id: folderId ?? null,
      name,
      size_bytes: size,
      mime_type: mimeType ?? null,
      r2_key: "pending",
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !file) {
    const message =
      insertError?.code === "23505" ? "Já existe um arquivo com esse nome nessa pasta." : "Não foi possível iniciar o upload.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  const r2Key = makeR2Key(user.id, file.id, name);
  await supabase.from("files").update({ r2_key: r2Key }).eq("id", file.id);

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      ContentType: mimeType || "application/octet-stream",
      ContentLength: size,
    }),
    { expiresIn: 60 * 15 }
  );

  return NextResponse.json({ fileId: file.id, uploadUrl });
}

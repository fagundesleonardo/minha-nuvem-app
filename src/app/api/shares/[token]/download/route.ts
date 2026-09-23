import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { r2, R2_BUCKET } from "@/lib/r2";

// Public endpoint (no login needed) — resolves a share token to a
// presigned R2 download URL. Uses the service-role client because an
// anonymous visitor has no RLS-visible session.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: share } = await supabase
    .from("shares")
    .select("file_id, folder_id, expires_at")
    .eq("token", token)
    .single();

  if (!share) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (!share.file_id) {
    return NextResponse.json({ error: "folder_shares_not_downloadable_yet" }, { status: 400 });
  }

  const { data: file } = await supabase.from("files").select("r2_key, name").eq("id", share.file_id).single();
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: file.r2_key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
    }),
    { expiresIn: 60 * 10 }
  );

  return NextResponse.json({ downloadUrl: url, name: file.name });
}

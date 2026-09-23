import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2, R2_BUCKET } from "@/lib/r2";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: file } = await supabase
    .from("files")
    .select("r2_key, name, owner_id")
    .eq("id", id)
    .single();

  if (!file || file.owner_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: file.r2_key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
    }),
    { expiresIn: 60 * 10 }
  );

  return NextResponse.json({ downloadUrl: url });
}

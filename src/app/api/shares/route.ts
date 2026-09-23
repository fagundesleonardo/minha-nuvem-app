import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId, folderId, expiresInDays } = await req.json();
  if (!fileId && !folderId) return NextResponse.json({ error: "invalid_target" }, { status: 400 });

  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000).toISOString() : null;

  const { data, error } = await supabase
    .from("shares")
    .insert({
      file_id: fileId ?? null,
      folder_id: folderId ?? null,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !data) return NextResponse.json({ error: "Não foi possível criar o link." }, { status: 400 });

  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  return NextResponse.json({ url: `${base}/s/${data.token}` });
}

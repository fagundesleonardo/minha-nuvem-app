import { createServiceRoleClient } from "@/lib/supabase/server";
import ShareDownloadButton from "./ShareDownloadButton";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: share } = await supabase
    .from("shares")
    .select("file_id, folder_id, expires_at")
    .eq("token", token)
    .single();

  const expired = share?.expires_at && new Date(share.expires_at) < new Date();

  if (!share || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">Link não encontrado</h1>
          <p className="text-slate-500 mt-1">Esse link não existe mais ou expirou.</p>
        </div>
      </div>
    );
  }

  const { data: file } = share.file_id
    ? await supabase.from("files").select("name, size_bytes, mime_type").eq("id", share.file_id).single()
    : { data: null };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Minha Nuvem</h1>
        {file ? (
          <>
            <p className="text-slate-700 break-all mb-4">{file.name}</p>
            <ShareDownloadButton token={token} />
          </>
        ) : (
          <p className="text-slate-500">Compartilhamento de pasta em breve.</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import Header from "@/components/Header";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  quota_bytes: number;
  used_bytes: number;
};

type MediaItem = {
  id: string; // device_media.id
  fileId: string;
  name: string;
  mimeType: string | null;
  mediaType: "photo" | "video";
  capturedAt: string | null;
  createdAt: string;
  url?: string; // lazily filled presigned URL
};

type UploadTask = { id: string; name: string; loaded: number; total: number; error?: string; done?: boolean };

export default function MediaClient({ profile }: { profile: Profile }) {
  const supabase = createClient();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("device_media")
      .select("id, file_id, media_type, captured_at, created_at, files(name, mime_type)")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(200);

    type Row = {
      id: string;
      file_id: string;
      media_type: "photo" | "video";
      captured_at: string | null;
      created_at: string;
      files: { name: string; mime_type: string | null } | { name: string; mime_type: string | null }[] | null;
    };

    const rows = ((data ?? []) as unknown as Row[]).map((row): MediaItem => {
      const fileInfo = Array.isArray(row.files) ? row.files[0] : row.files;
      return {
        id: row.id,
        fileId: row.file_id,
        name: fileInfo?.name ?? "arquivo",
        mimeType: fileInfo?.mime_type ?? null,
        mediaType: row.media_type,
        capturedAt: row.captured_at,
        createdAt: row.created_at,
      };
    });
    setItems(rows);
    setLoading(false);
  }, [profile.id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  async function handleFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (list.length === 0) return;

    const tasks: UploadTask[] = list.map((f) => ({ id: crypto.randomUUID(), name: f.name, loaded: 0, total: f.size }));
    setUploads((prev) => [...prev, ...tasks]);

    await Promise.all(
      list.map(async (file, i) => {
        const taskId = tasks[i].id;
        const result = await uploadFile(file, null, (p) =>
          setUploads((prev) => prev.map((t) => (t.id === taskId ? { ...t, loaded: p.loaded, total: p.total } : t)))
        ).catch((err) => ({ ok: false as const, error: err.message || "Falha no envio" }));

        if (result.ok) {
          await supabase.from("device_media").insert({
            owner_id: profile.id,
            file_id: result.fileId,
            media_type: file.type.startsWith("video/") ? "video" : "photo",
            captured_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
          });
        }

        setUploads((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, done: true, error: result.ok ? undefined : result.error } : t))
        );
      })
    );

    reload();
    setTimeout(() => setUploads((prev) => prev.filter((t) => !t.done || t.error)), 4000);
  }

  async function ensureUrl(item: MediaItem): Promise<string | null> {
    if (item.url) return item.url;
    const res = await fetch(`/api/files/${item.fileId}/presign-download`);
    if (!res.ok) return null;
    const data = await res.json();
    const url = data.downloadUrl as string | undefined;
    if (!url) return null;
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, url } : it)));
    return url;
  }

  async function openLightbox(item: MediaItem) {
    setLightbox(item);
    await ensureUrl(item);
  }

  async function handleDelete(item: MediaItem) {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    await fetch(`/api/files/${item.fileId}`, { method: "DELETE" });
    setLightbox(null);
    reload();
  }

  async function handleShare(item: MediaItem) {
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: item.fileId }),
    });
    const data = await res.json();
    if (data.url) {
      await navigator.clipboard.writeText(data.url).catch(() => {});
      alert(`Link copiado:\n${data.url}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header isAdmin={profile.role === "admin"} section="dashboard" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-lg font-semibold text-slate-900">📷 Fotos e vídeos</h1>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Adicionar do celular
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          Envie fotos e vídeos do seu celular (ou computador) e veja tudo aqui em um único lugar, como uma galeria.
        </p>

        {uploads.length > 0 && (
          <div className="mb-4 bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {uploads.map((u) => (
              <div key={u.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">{u.name}</span>
                {u.error ? (
                  <span className="text-red-600 text-xs">{u.error}</span>
                ) : u.done ? (
                  <span className="text-green-600 text-xs">Concluído</span>
                ) : (
                  <>
                    <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${u.total ? (u.loaded / u.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-10 text-right">
                      {u.total ? Math.round((u.loaded / u.total) * 100) : 0}%
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-400 text-sm">
            Nenhuma foto ou vídeo ainda. Use &quot;Adicionar do celular&quot; para enviar as primeiras.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {items.map((item) => (
              <Thumb key={item.id} item={item} onOpen={() => openLightbox(item)} onLoadUrl={() => ensureUrl(item)} />
            ))}
          </div>
        )}
      </main>

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-3xl w-full max-h-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {lightbox.url ? (
              lightbox.mediaType === "video" ? (
                <video src={lightbox.url} controls autoPlay className="max-h-[75vh] max-w-full rounded-lg" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lightbox.url} alt={lightbox.name} className="max-h-[75vh] max-w-full rounded-lg object-contain" />
              )
            ) : (
              <div className="text-white text-sm">Carregando...</div>
            )}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="text-white text-sm truncate max-w-xs">{lightbox.name}</span>
              <button
                onClick={() => lightbox.url && window.location.assign(lightbox.url)}
                className="text-sm px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Baixar
              </button>
              <button
                onClick={() => handleShare(lightbox)}
                className="text-sm px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Compartilhar
              </button>
              <button
                onClick={() => handleDelete(lightbox)}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-600/80 text-white hover:bg-red-600"
              >
                Excluir
              </button>
              <button
                onClick={() => setLightbox(null)}
                className="text-sm px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ item, onOpen, onLoadUrl }: { item: MediaItem; onOpen: () => void; onLoadUrl: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (visible && !item.url) onLoadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <button
      ref={ref}
      onClick={onOpen}
      className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden group"
    >
      {item.url ? (
        item.mediaType === "video" ? (
          <video src={item.url} className="w-full h-full object-cover" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl text-slate-300">
          {item.mediaType === "video" ? "🎬" : "🖼️"}
        </div>
      )}
      {item.mediaType === "video" && (
        <span className="absolute bottom-1 right-1 text-white text-xs bg-black/60 rounded px-1">▶</span>
      )}
      <span className="absolute inset-0 group-hover:bg-black/10 transition-colors" />
    </button>
  );
}

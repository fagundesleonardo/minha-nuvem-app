"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { formatBytes, formatDate } from "@/lib/format";
import Header from "@/components/Header";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  quota_bytes: number;
  used_bytes: number;
};

type FolderRow = { id: string; name: string; parent_id: string | null };
type FileRow = {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string | null;
  folder_id: string | null;
  status: string;
  created_at: string;
};

type UploadTask = { id: string; name: string; loaded: number; total: number; error?: string; done?: boolean };

export default function DashboardClient({ profile: initialProfile }: { profile: Profile }) {
  const supabase = createClient();
  const [profile, setProfile] = useState(initialProfile);
  const [path, setPath] = useState<FolderRow[]>([]); // breadcrumb, [] = root
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: f }, { data: fi }, { data: p }] = await Promise.all([
      supabase
        .from("folders")
        .select("id, name, parent_id")
        .eq("owner_id", profile.id)
        .is("parent_id", currentFolderId)
        .order("name"),
      supabase
        .from("files")
        .select("id, name, size_bytes, mime_type, folder_id, status, created_at")
        .eq("owner_id", profile.id)
        .is("folder_id", currentFolderId)
        .eq("status", "ready")
        .order("name"),
      supabase.from("profiles").select("id, email, display_name, role, quota_bytes, used_bytes").eq("id", profile.id).single(),
    ]);
    setFolders(f ?? []);
    setFiles(fi ?? []);
    if (p) setProfile(p);
    setLoading(false);
  }, [currentFolderId, profile.id, supabase]);

  useEffect(() => {
    // Data fetch on mount / folder change — setLoading/setFolders/etc. run
    // synchronously at the top of reload(), which the new React Compiler
    // lint flags on principle; safe here since there's nothing to race
    // against on first paint (no subscriptions, no cleanup needed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  async function handleFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    const tasks: UploadTask[] = list.map((f) => ({ id: crypto.randomUUID(), name: f.name, loaded: 0, total: f.size }));
    setUploads((prev) => [...prev, ...tasks]);

    await Promise.all(
      list.map(async (file, i) => {
        const taskId = tasks[i].id;
        const result = await uploadFile(file, currentFolderId, (p) =>
          setUploads((prev) => prev.map((t) => (t.id === taskId ? { ...t, loaded: p.loaded, total: p.total } : t)))
        ).catch((err) => ({ ok: false as const, error: err.message || "Falha no envio" }));

        setUploads((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, done: true, error: result.ok ? undefined : result.error } : t))
        );
      })
    );

    reload();
    setTimeout(() => setUploads((prev) => prev.filter((t) => !t.done || t.error)), 4000);
  }

  async function handleCreateFolder() {
    const name = prompt("Nome da pasta:");
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
    if (res.ok) reload();
    else alert("Já existe uma pasta com esse nome aqui.");
  }

  async function handleDownload(fileId: string) {
    const res = await fetch(`/api/files/${fileId}/presign-download`);
    const data = await res.json();
    if (data.downloadUrl) window.location.assign(data.downloadUrl);
  }

  async function handleShare(fileId: string) {
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });
    const data = await res.json();
    if (data.url) {
      await navigator.clipboard.writeText(data.url).catch(() => {});
      alert(`Link copiado:\n${data.url}`);
    }
    setMenuFor(null);
  }

  async function handleRenameFile(file: FileRow) {
    const name = prompt("Novo nome:", file.name);
    if (!name || name === file.name) return setMenuFor(null);
    await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setMenuFor(null);
    reload();
  }

  async function handleDeleteFile(file: FileRow) {
    if (!confirm(`Excluir "${file.name}"?`)) return;
    await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    setMenuFor(null);
    reload();
  }

  async function handleRenameFolder(folder: FolderRow) {
    const name = prompt("Novo nome:", folder.name);
    if (!name || name === folder.name) return setMenuFor(null);
    await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setMenuFor(null);
    reload();
  }

  async function handleDeleteFolder(folder: FolderRow) {
    if (!confirm(`Excluir a pasta "${folder.name}" e tudo dentro dela?`)) return;
    await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    setMenuFor(null);
    reload();
  }

  const usedPct = Math.min(100, (profile.used_bytes / profile.quota_bytes) * 100);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header isAdmin={profile.role === "admin"} section="dashboard" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Quota bar */}
        <div className="mb-4 bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>
              {formatBytes(profile.used_bytes)} de {formatBytes(profile.quota_bytes)} usados
            </span>
            <span>{usedPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${usedPct > 90 ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {/* Breadcrumb + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 text-sm text-slate-600 flex-wrap">
            <button onClick={() => setPath([])} className="hover:text-blue-600 font-medium">
              Meus arquivos
            </button>
            {path.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                <span className="text-slate-300">/</span>
                <button onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-blue-600">
                  {p.name}
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/media" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">
              📷 Fotos e vídeos
            </Link>
            <button
              onClick={handleCreateFolder}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100"
            >
              + Pasta
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Enviar arquivos
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Upload progress tray */}
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

        {/* Drop zone / file list */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          className={`bg-white border rounded-lg overflow-hidden ${dragOver ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}
        >
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              Pasta vazia. Arraste arquivos aqui ou use &quot;Enviar arquivos&quot;.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {folders.map((folder) => (
                <li key={folder.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 group">
                  <button
                    onClick={() => setPath([...path, folder])}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                  >
                    <span>📁</span>
                    <span className="truncate text-sm font-medium text-slate-800">{folder.name}</span>
                  </button>
                  <RowMenu
                    open={menuFor === folder.id}
                    onToggle={() => setMenuFor(menuFor === folder.id ? null : folder.id)}
                    actions={[
                      { label: "Renomear", onClick: () => handleRenameFolder(folder) },
                      { label: "Excluir", onClick: () => handleDeleteFolder(folder), danger: true },
                    ]}
                  />
                </li>
              ))}
              {files.map((file) => (
                <li key={file.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
                  <span>📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
                    </p>
                  </div>
                  <RowMenu
                    open={menuFor === file.id}
                    onToggle={() => setMenuFor(menuFor === file.id ? null : file.id)}
                    actions={[
                      { label: "Baixar", onClick: () => handleDownload(file.id) },
                      { label: "Compartilhar", onClick: () => handleShare(file.id) },
                      { label: "Renomear", onClick: () => handleRenameFile(file) },
                      { label: "Excluir", onClick: () => handleDeleteFile(file), danger: true },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function RowMenu({
  open,
  onToggle,
  actions,
}: {
  open: boolean;
  onToggle: () => void;
  actions: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <div className="relative">
      <button onClick={onToggle} className="text-slate-400 hover:text-slate-700 px-2">
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-40">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${a.danger ? "text-red-600" : "text-slate-700"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

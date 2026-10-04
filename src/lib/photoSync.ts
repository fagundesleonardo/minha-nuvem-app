"use client";

import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";

/**
 * "Authorize once, sync everything" photo/video backup.
 *
 * Browsers deliberately don't let a web app ask for blanket access to a
 * phone's whole photo library the way a native app can — there is no
 * "grant full access" permission on the web. The closest equivalent is the
 * File System Access API: the user picks a folder (e.g. DCIM/Camera) ONCE,
 * and from then on every file in it — current and future — is readable
 * without picking files one by one again. That's what this module does.
 *
 * Support: desktop Chrome/Edge and Android Chrome. NOT supported on iOS
 * Safari or Firefox (no such API exists there) — those fall back to the
 * normal multi-select file picker, which still lets someone select many
 * files at once, just not "all, forever, with zero taps".
 */

const DB_NAME = "minha-nuvem-sync";
const STORE = "handles";
const HANDLE_KEY = "cameraFolder";

export function isAutoSyncSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isAutoSyncSupported()) return null;
  try {
    return (await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetStoredHandle(): Promise<void> {
  try {
    await idbDelete(HANDLE_KEY);
  } catch {
    // ignore
  }
}

/** Checks read permission on an already-picked folder, asking again only if the browser requires it — never reopens the file/folder picker. */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const current = (await handle.queryPermission?.({ mode: "read" })) ?? "granted";
    if (current === "granted") return true;
    const requested = (await handle.requestPermission?.({ mode: "read" })) ?? "denied";
    return requested === "granted";
  } catch {
    return false;
  }
}

/**
 * Opens the native folder picker ONE time, pre-focused on the device's
 * Pictures/Camera folder (`startIn: "pictures"`) so the person doesn't have
 * to navigate anywhere — they land straight on their photos and just
 * confirm. That single confirmation is the only interaction this feature
 * ever asks for: everything inside the folder (now and added later) is
 * then synced automatically, with no per-file selection, on every return
 * visit (subject to the browser's own permission re-confirmation, which is
 * also automatic as long as the permission was already granted).
 *
 * A single user-initiated confirmation like this is unavoidable on the web
 * — no browser (Chrome, Safari, Firefox) lets any website, installed or
 * not, read local files without at least one explicit grant. That's a
 * deliberate privacy boundary of the web platform itself, the same reason
 * even native iOS/Android apps show a one-time "Allow access to Photos?"
 * dialog. This function exists to make that one unavoidable step as close
 * to zero-effort as possible.
 */
export async function authorizeFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isAutoSyncSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker!({
      id: "minha-nuvem-camera",
      mode: "read",
      startIn: "pictures",
    });
    await idbSet(HANDLE_KEY, handle);
    return handle;
  } catch {
    // user cancelled the picker, or it was dismissed
    return null;
  }
}

const MEDIA_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|mp4|mov|m4v|3gp|webm|avi|mkv)$/i;
const MAX_DEPTH = 5;

async function* walk(dir: FileSystemDirectoryHandle, depth = 0): AsyncGenerator<File> {
  if (depth > MAX_DEPTH) return;
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      yield* walk(handle, depth + 1);
    } else if (MEDIA_EXT.test(name)) {
      try {
        yield await (handle as FileSystemFileHandle).getFile();
      } catch {
        // unreadable entry (permission revoked mid-walk, locked file, etc.) — skip it
      }
    }
  }
}

export type SyncProgress = { phase: "scanning" | "uploading"; current?: string; done: number; total?: number };
export type SyncResult = { uploaded: number; skipped: number; failed: number };

/**
 * Walks the authorized folder, skips anything already backed up (matched
 * by name + size against this user's existing files), and uploads the
 * rest — same upload path the manual picker uses.
 */
export async function syncNow(onProgress?: (p: SyncProgress) => void): Promise<SyncResult | null> {
  const handle = await getStoredHandle();
  if (!handle) return null;
  if (!(await ensurePermission(handle))) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  onProgress?.({ phase: "scanning", done: 0 });

  const { data: existing } = await supabase.from("files").select("name, size_bytes").eq("owner_id", user.id);
  const known = new Set((existing ?? []).map((f) => `${f.name}:${f.size_bytes}`));

  const result: SyncResult = { uploaded: 0, skipped: 0, failed: 0 };
  let done = 0;

  for await (const file of walk(handle)) {
    const key = `${file.name}:${file.size}`;
    if (known.has(key)) {
      result.skipped++;
      continue;
    }

    onProgress?.({ phase: "uploading", current: file.name, done });

    const uploadResult = await uploadFile(file, null).catch((err: Error) => ({
      ok: false as const,
      error: err.message || "Falha no envio",
    }));

    if (uploadResult.ok) {
      await supabase.from("device_media").insert({
        owner_id: user.id,
        file_id: uploadResult.fileId,
        media_type: file.type.startsWith("video/") ? "video" : "photo",
        captured_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      });
      known.add(key);
      result.uploaded++;
    } else {
      result.failed++;
    }

    done++;
    onProgress?.({ phase: "uploading", done });
  }

  return result;
}

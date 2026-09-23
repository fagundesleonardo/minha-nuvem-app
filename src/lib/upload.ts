export type UploadProgress = { loaded: number; total: number };

/**
 * Uploads a single File straight to R2 using a presigned URL (browser ->
 * R2, no VPS in the middle) and reports real progress via XHR so the UI
 * can show an accurate percentage/speed instead of Nextcloud's old
 * "stuck at 3 KB/s forever" behaviour.
 */
export async function uploadFile(
  file: File,
  folderId: string | null,
  onProgress?: (p: UploadProgress) => void
): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  const presignRes = await fetch("/api/files/presign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, mimeType: file.type, folderId }),
  });

  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    return { ok: false, error: friendlyError(body.error) };
  }

  const { fileId, uploadUrl } = await presignRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total });
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload_failed_${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network_error"));
    xhr.send(file);
  }).catch(async (err) => {
    // Clean up the pending row so it doesn't linger as a broken entry.
    await fetch(`/api/files/${fileId}`, { method: "DELETE" }).catch(() => {});
    throw err;
  });

  await fetch(`/api/files/${fileId}/complete`, { method: "POST" });
  return { ok: true, fileId };
}

function friendlyError(code?: string) {
  switch (code) {
    case "quota_exceeded":
      return "Você atingiu o limite de espaço da sua conta.";
    case "account_suspended":
      return "Sua conta está suspensa. Fale com o suporte.";
    default:
      return typeof code === "string" ? code : "Não foi possível enviar o arquivo.";
  }
}

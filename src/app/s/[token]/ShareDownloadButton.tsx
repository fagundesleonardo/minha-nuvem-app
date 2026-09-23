"use client";

import { useState } from "react";

export default function ShareDownloadButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    const res = await fetch(`/api/shares/${token}/download`);
    const data = await res.json();
    setLoading(false);
    if (data.downloadUrl) window.location.href = data.downloadUrl;
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
    >
      {loading ? "Preparando..." : "Baixar arquivo"}
    </button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Used when the dashboard couldn't load the user's profile even though
 * their auth session IS valid (see ProfileLoadIssue in page.tsx). A plain
 * `<Link href="/login">` doesn't work here: proxy.ts redirects any
 * authenticated visitor away from /login straight back to /dashboard,
 * which immediately hits the same profile-load failure again — an
 * infinite bounce the person can never click their way out of. Signing
 * out first clears that session so the redirect actually lands on /login.
 */
export default function SessionRetryButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleRetry}
      disabled={loading}
      className="text-blue-600 hover:underline text-sm font-medium disabled:opacity-60"
    >
      {loading ? "Saindo..." : "Sair e tentar novamente"}
    </button>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

function SessionIssue() {
  // Deliberately a static message with a manual link, NOT a redirect().
  // proxy.ts already redirects signed-out visitors away from /dashboard,
  // so this only renders in a rare edge case (e.g. a stale/split auth
  // cookie that middleware accepts but this Server Component's own
  // getUser() call doesn't). Auto-redirecting to /login here risks a
  // bounce loop if that disagreement persists for the request; a static
  // message with a link always breaks the loop.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Sessão expirada</h1>
        <p className="text-slate-600 text-sm mb-4">
          Não conseguimos confirmar seu login. Tente entrar novamente.
        </p>
        <Link href="/login" className="text-blue-600 hover:underline text-sm font-medium">
          Ir para o login
        </Link>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[dashboard] getUser() returned no user", {
      message: userError?.message,
      status: userError?.status,
      name: userError?.name,
    });
    return <SessionIssue />;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, quota_bytes, used_bytes")
    .eq("id", user.id)
    .single();

  if (!profile) {
    console.error("[dashboard] profile lookup failed", {
      userId: user.id,
      userEmail: user.email,
      message: profileError?.message,
      code: profileError?.code,
      details: profileError?.details,
      hint: profileError?.hint,
    });
    return <SessionIssue />;
  }

  return <DashboardClient profile={profile} />;
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";
import SessionRetryButton from "./SessionRetryButton";

function SessionExpired() {
  // The auth session itself is genuinely missing/invalid here
  // (getUser() returned no user) — proxy.ts already redirects signed-out
  // visitors away from /dashboard, so this only renders in a rare edge
  // case (e.g. a stale/split auth cookie that middleware accepts but this
  // Server Component's own getUser() call doesn't). A plain link to
  // /login is safe in this specific case: since there's no user, proxy.ts
  // won't redirect it away.
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

function ProfileLoadIssue() {
  // Different case from SessionExpired above: the auth session IS valid
  // (getUser() succeeded) but loading the "profiles" row failed — e.g. a
  // Supabase config issue, not an expired login. Calling this "session
  // expired" would be wrong AND a plain /login link would be actively
  // broken here: proxy.ts redirects any authenticated visitor away from
  // /login straight back to /dashboard, which hits this same failure
  // again immediately — an infinite bounce the person can never click
  // their way out of ("expired" message reappears instantly, never
  // returns to login). SessionRetryButton signs out first to break that
  // loop before redirecting.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm text-center bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Não foi possível carregar seus dados</h1>
        <p className="text-slate-600 text-sm mb-4">
          Seu login foi confirmado, mas houve um problema ao carregar seu perfil. Tente novamente — se persistir, é um
          problema de configuração do servidor.
        </p>
        <SessionRetryButton />
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
    return <SessionExpired />;
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
    return <ProfileLoadIssue />;
  }

  return <DashboardClient profile={profile} />;
}

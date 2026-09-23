"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Header({ isAdmin, section }: { isAdmin?: boolean; section?: "dashboard" | "admin" }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-slate-900">
            ☁️ Minha Nuvem
          </Link>
          {isAdmin && (
            <nav className="flex gap-4 text-sm">
              <Link
                href="/dashboard"
                className={section === "dashboard" ? "text-blue-600 font-medium" : "text-slate-500 hover:text-slate-900"}
              >
                Arquivos
              </Link>
              <Link
                href="/admin"
                className={section === "admin" ? "text-blue-600 font-medium" : "text-slate-500 hover:text-slate-900"}
              >
                Admin
              </Link>
            </nav>
          )}
        </div>
        <button onClick={handleSignOut} className="text-sm text-slate-500 hover:text-slate-900">
          Sair
        </button>
      </div>
    </header>
  );
}

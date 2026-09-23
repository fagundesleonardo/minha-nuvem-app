"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { formatBytes, formatDate } from "@/lib/format";

type Overview = {
  userCount: number;
  suspendedCount: number;
  fileCount: number;
  folderCount: number;
  totalUsedBytes: number;
  totalQuotaBytes: number;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: "user" | "admin";
  status: "active" | "suspended";
  plan_id: string | null;
  quota_bytes: number;
  used_bytes: number;
  notes: string | null;
  created_at: string;
};

type Plan = {
  id: string;
  name: string;
  quota_bytes: number;
  price_cents: number | null;
  description: string | null;
};

type SystemStatus = {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number; error?: string };
  storage: { ok: boolean; latencyMs: number; error?: string };
  server: {
    uptimeSeconds: number;
    nodeVersion: string;
    loadAvg1m: number;
    cpuCount: number;
    memoryTotalBytes: number;
    memoryFreeBytes: number;
    memoryUsedPct: number | null;
  };
};

const GB = 1024 * 1024 * 1024;
const TABS = ["visao-geral", "usuarios", "planos", "sistema"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  "visao-geral": "Visão geral",
  usuarios: "Usuários",
  planos: "Planos",
  sistema: "Sistema",
};

export default function AdminClient({ adminId }: { adminId: string }) {
  const [tab, setTab] = useState<Tab>("visao-geral");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header isAdmin section="admin" />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">Painel do administrador</h1>
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "visao-geral" && <OverviewTab />}
        {tab === "usuarios" && <UsersTab adminId={adminId} />}
        {tab === "planos" && <PlansTab />}
        {tab === "sistema" && <SystemTab />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------
function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/overview");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading || !data) return <p className="text-sm text-slate-400">Carregando...</p>;

  const usedPct = data.totalQuotaBytes ? Math.min(100, (data.totalUsedBytes / data.totalQuotaBytes) * 100) : 0;

  const cards = [
    { label: "Usuários", value: data.userCount.toLocaleString("pt-BR") },
    { label: "Usuários suspensos", value: data.suspendedCount.toLocaleString("pt-BR") },
    { label: "Arquivos", value: data.fileCount.toLocaleString("pt-BR") },
    { label: "Pastas", value: data.folderCount.toLocaleString("pt-BR") },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-2xl font-semibold text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Armazenamento usado (todos os usuários)</span>
          <span>
            {formatBytes(data.totalUsedBytes)} de {formatBytes(data.totalQuotaBytes)} ({usedPct.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${usedPct > 90 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${usedPct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------
function UsersTab({ adminId }: { adminId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { quotaGb: string; planId: string; notes: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, pRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/plans")]);
    const [uData, pData] = await Promise.all([uRes.json(), pRes.json()]);
    const list: UserRow[] = uData.users ?? [];
    setUsers(list);
    setPlans(pData.plans ?? []);
    setDrafts(
      Object.fromEntries(
        list.map((u) => [u.id, { quotaGb: (u.quota_bytes / GB).toFixed(1), planId: u.plan_id ?? "", notes: u.notes ?? "" }])
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggleRole(u: UserRow) {
    const newRole = u.role === "admin" ? "user" : "admin";
    if (u.id === adminId && newRole === "user") {
      alert("Você não pode remover seu próprio acesso de administrador.");
      return;
    }
    setSavingId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
    setSavingId(null);
  }

  async function toggleStatus(u: UserRow) {
    const newStatus = u.status === "active" ? "suspended" : "active";
    if (u.id === adminId && newStatus === "suspended") {
      alert("Você não pode suspender sua própria conta.");
      return;
    }
    setSavingId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
    setSavingId(null);
  }

  async function saveDraft(u: UserRow) {
    const draft = drafts[u.id];
    const quotaBytes = Math.round(parseFloat(draft.quotaGb || "0") * GB);
    setSavingId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quotaBytes, planId: draft.planId || null, notes: draft.notes }),
    });
    await load();
    setSavingId(null);
  }

  function updateDraft(id: string, patch: Partial<{ quotaGb: string; planId: string; notes: string }>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando...</p>;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
            <th className="px-3 py-2 font-medium">Usuário</th>
            <th className="px-3 py-2 font-medium">Papel</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Plano</th>
            <th className="px-3 py-2 font-medium">Cota (GB)</th>
            <th className="px-3 py-2 font-medium">Uso</th>
            <th className="px-3 py-2 font-medium">Notas</th>
            <th className="px-3 py-2 font-medium">Desde</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {users.map((u) => {
            const draft = drafts[u.id] ?? { quotaGb: "0", planId: "", notes: "" };
            const usedPct = u.quota_bytes ? Math.min(100, (u.used_bytes / u.quota_bytes) * 100) : 0;
            return (
              <tr key={u.id} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-800">{u.display_name || u.email}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleRole(u)}
                    disabled={savingId === u.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      u.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {u.role === "admin" ? "Admin" : "Usuário"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => toggleStatus(u)}
                    disabled={savingId === u.id}
                    className={`text-xs px-2 py-1 rounded-full ${
                      u.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.status === "active" ? "Ativo" : "Suspenso"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={draft.planId}
                    onChange={(e) => updateDraft(u.id, { planId: e.target.value })}
                    className="text-xs border border-slate-200 rounded px-1.5 py-1"
                  >
                    <option value="">Sem plano</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={draft.quotaGb}
                    onChange={(e) => updateDraft(u.id, { quotaGb: e.target.value })}
                    className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1"
                  />
                </td>
                <td className="px-3 py-2 w-32">
                  <div className="text-xs text-slate-500 mb-1">{formatBytes(u.used_bytes)}</div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${usedPct > 90 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${usedPct}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={draft.notes}
                    onChange={(e) => updateDraft(u.id, { notes: e.target.value })}
                    placeholder="—"
                    className="w-28 text-xs border border-slate-200 rounded px-1.5 py-1"
                  />
                </td>
                <td className="px-3 py-2 text-xs text-slate-400 whitespace-nowrap">{formatDate(u.created_at)}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => saveDraft(u)}
                    disabled={savingId === u.id}
                    className="text-xs px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------
function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", quotaGb: "10", priceReais: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/plans");
    const data = await res.json();
    setPlans(data.plans ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.quotaGb) return;
    await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        quotaBytes: Math.round(parseFloat(form.quotaGb) * GB),
        priceCents: form.priceReais ? Math.round(parseFloat(form.priceReais) * 100) : null,
        description: form.description || null,
      }),
    });
    setForm({ name: "", quotaGb: "10", priceReais: "", description: "" });
    load();
  }

  async function deletePlan(id: string) {
    if (!confirm("Excluir este plano? Usuários com esse plano ficarão sem plano atribuído (a cota atual deles é mantida).")) return;
    await fetch(`/api/admin/plans/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando...</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={createPlan} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Nome</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="text-sm border border-slate-200 rounded px-2 py-1.5 w-32"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cota (GB)</label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={form.quotaGb}
            onChange={(e) => setForm({ ...form, quotaGb: e.target.value })}
            className="text-sm border border-slate-200 rounded px-2 py-1.5 w-24"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Preço (R$/mês)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.priceReais}
            onChange={(e) => setForm({ ...form, priceReais: e.target.value })}
            className="text-sm border border-slate-200 rounded px-2 py-1.5 w-24"
            placeholder="opcional"
          />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="block text-xs text-slate-500 mb-1">Descrição</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="text-sm border border-slate-200 rounded px-2 py-1.5 w-full"
            placeholder="opcional"
          />
        </div>
        <button type="submit" className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          + Novo plano
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-50">
        {plans.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Nenhum plano cadastrado ainda.</p>
        ) : (
          plans.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(p.quota_bytes)}
                  {p.price_cents != null ? ` · R$ ${(p.price_cents / 100).toFixed(2)}/mês` : ""}
                  {p.description ? ` · ${p.description}` : ""}
                </p>
              </div>
              <button onClick={() => deletePlan(p.id)} className="text-xs text-red-600 hover:underline">
                Excluir
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sistema
// ---------------------------------------------------------------------
function SystemTab() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/system");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading || !status) return <p className="text-sm text-slate-400">Verificando...</p>;

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}min`;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-400">Verificado em {formatDate(status.checkedAt)}</p>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100">
          Verificar agora
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <StatusCard title="Banco de dados (Supabase)" ok={status.database.ok} latencyMs={status.database.latencyMs} error={status.database.error} />
        <StatusCard title="Armazenamento (Cloudflare R2)" ok={status.storage.ok} latencyMs={status.storage.latencyMs} error={status.storage.error} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium text-slate-800">Servidor</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-400">Tempo ativo</p>
            <p className="text-slate-800">{formatUptime(status.server.uptimeSeconds)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Node.js</p>
            <p className="text-slate-800">{status.server.nodeVersion}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Carga (1 min)</p>
            <p className="text-slate-800">{status.server.loadAvg1m.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">CPUs</p>
            <p className="text-slate-800">{status.server.cpuCount}</p>
          </div>
        </div>
        {status.server.memoryUsedPct != null && (
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Memória do processo</span>
              <span>
                {formatBytes(status.server.memoryTotalBytes - status.server.memoryFreeBytes)} de{" "}
                {formatBytes(status.server.memoryTotalBytes)} ({status.server.memoryUsedPct}%)
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${status.server.memoryUsedPct > 90 ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${status.server.memoryUsedPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusCard({ title, ok, latencyMs, error }: { title: string; ok: boolean; latencyMs: number; error?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {ok ? "OK" : "Falha"}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1">{ok ? `${latencyMs}ms de latência` : error || "Sem resposta"}</p>
    </div>
  );
}

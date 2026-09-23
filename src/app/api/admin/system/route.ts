import { NextResponse } from "next/server";
import os from "node:os";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { r2, R2_BUCKET } from "@/lib/r2";

async function checkR2(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await r2.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : "erro desconhecido" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if ("error" in auth) return auth.error;

  const dbStart = Date.now();
  const { error: dbError } = await supabase.from("plans").select("id", { count: "exact", head: true });
  const db = { ok: !dbError, latencyMs: Date.now() - dbStart, error: dbError?.message };

  const r2Status = await checkR2();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    database: db,
    storage: r2Status,
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      loadAvg1m: os.loadavg()[0],
      cpuCount: os.cpus().length,
      memoryTotalBytes: totalMem,
      memoryFreeBytes: freeMem,
      memoryUsedPct: totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : null,
    },
  });
}

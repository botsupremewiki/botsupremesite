// Cron Vercel : cleanup quotidien des données anciennes pour limiter
// le bloat de la DB (free tier Supabase ~500 MB). Appelle la RPC
// `cleanup_old_data` (security definer, service_role only).
//
// Schedule : tous les jours à 03:30 UTC (heure creuse).
// Voir vercel.json pour l'inscription du cron.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/cleanup_old_data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    return NextResponse.json({ ok: res.ok, result: json });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Cron : refresh quotidien des matérialized views méta (stats par carte).
// La MV `tcg_meta_card_stats_mv` est lourde à calculer (joins sur tous
// les battles + decks), donc on la met à jour 1x/jour à 02:00 UTC.

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
    const res = await fetch(
      `${url}/rest/v1/rpc/refresh_tcg_meta_card_stats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      },
    );
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

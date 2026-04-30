// Cron Vercel : clôture les saisons TCG arrivées à terme et ouvre la
// suivante. Appelé quotidiennement par Vercel Cron — la fonction SQL
// `close_current_season_and_open_next` est idempotente et skip si la
// saison courante a moins de 25 jours.
//
// Sécurité : Vercel Cron envoie automatiquement
//   Authorization: Bearer <CRON_SECRET>
// si la variable d'env CRON_SECRET est définie. On valide ce header
// avant d'exécuter quoi que ce soit.
//
// Pour déclencher manuellement : forcer p_force=true via /api/cron/close-tcg-season?force=1
// (réservé service role).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TCG_GAMES_TO_TICK = ["pokemon", "onepiece", "runeterra"] as const;

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

  const u = new URL(request.url);
  const force = u.searchParams.get("force") === "1";

  const results: Record<string, unknown> = {};
  for (const gameId of TCG_GAMES_TO_TICK) {
    try {
      const res = await fetch(
        `${url}/rest/v1/rpc/close_current_season_and_open_next`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ p_game_id: gameId, p_force: force }),
        },
      );
      const json = await res.json();
      results[gameId] = res.ok ? json : { error: json };
    } catch (err) {
      results[gameId] = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({ ok: true, results });
}

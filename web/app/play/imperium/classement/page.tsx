import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@shared/imperium";

export const dynamic = "force-dynamic";

type LeaderboardRow = {
  week_start: string;
  user_id: string;
  category: "attack" | "defense" | "economy";
  score: number;
};

type HoFRow = {
  id: string;
  user_id: string;
  title: string;
  season: number | null;
  unlocked_at: string;
};

const REWARDS = [2000, 1500, 1000, 700, 500, 400, 300, 200, 150, 100];

export default async function ClassementPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");

  const supabase = await createClient();
  const lb: LeaderboardRow[] = supabase
    ? (
        (
          await supabase
            .from("imperium_leaderboard_weekly")
            .select("*")
            .order("score", { ascending: false })
        ).data ?? []
      )
    : [];
  const hof: HoFRow[] = supabase
    ? (
        (
          await supabase
            .from("imperium_hall_of_fame")
            .select("*")
            .order("unlocked_at", { ascending: false })
            .limit(50)
        ).data ?? []
      )
    : [];

  // Pivote par catégorie, prend top 10 de la semaine la plus récente
  const latestWeek = lb.length ? lb[0].week_start : null;
  const pivot: Record<"attack" | "defense" | "economy", LeaderboardRow[]> = {
    attack: [],
    defense: [],
    economy: [],
  };
  if (latestWeek) {
    for (const row of lb) {
      if (row.week_start !== latestWeek) continue;
      pivot[row.category].push(row);
    }
    for (const k of ["attack", "defense", "economy"] as const) {
      pivot[k].sort((a, b) => b.score - a.score);
      pivot[k] = pivot[k].slice(0, 10);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/imperium" className="text-zinc-400 hover:text-zinc-100">
            ← Imperium
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-yellow-200">🏆 Classement</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(234,179,8,0.04),transparent_60%)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <section>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
              Classement hebdo {latestWeek ? `· ${latestWeek}` : ""}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <CategoryColumn
                title="⚔ Attaque"
                rows={pivot.attack}
                accent="border-rose-400/40"
              />
              <CategoryColumn
                title="🛡 Défense"
                rows={pivot.defense}
                accent="border-sky-400/40"
              />
              <CategoryColumn
                title="💰 Économie"
                rows={pivot.economy}
                accent="border-emerald-400/40"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-400">
              Hall of Fame
            </div>
            {hof.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-500">
                Aucun titre permanent enregistré pour l&apos;instant.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {hof.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs"
                  >
                    <span className="text-base">👑</span>
                    <span className="text-amber-200">{h.title}</span>
                    {h.season != null && (
                      <span className="text-[10px] text-zinc-500">
                        Saison {h.season}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-zinc-500">
                      {h.user_id.slice(0, 8)}…
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function CategoryColumn({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: LeaderboardRow[];
  accent: string;
}) {
  return (
    <div className={`rounded-xl border ${accent} bg-black/40 p-3`}>
      <div className="mb-2 text-sm font-semibold text-zinc-100">{title}</div>
      {rows.length === 0 ? (
        <div className="text-[10px] text-zinc-500">—</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((r, i) => (
            <div
              key={r.user_id}
              className="flex items-center gap-2 rounded px-2 py-1 text-[11px]"
            >
              <span className="w-5 tabular-nums text-zinc-500">#{i + 1}</span>
              <span className="flex-1 truncate text-zinc-200">
                {r.user_id.slice(0, 8)}…
              </span>
              <span className="tabular-nums text-zinc-300">
                {formatNumber(r.score)}
              </span>
              <span className="tabular-nums text-amber-300">
                +{formatNumber(REWARDS[i] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

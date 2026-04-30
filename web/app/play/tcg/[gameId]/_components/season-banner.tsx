// Bandeau « Saison X — Y jours restants — Tier (ELO) » affiché en haut
// du lobby ranked. Server-rendered : on passe juste le RPC payload au
// client pour le countdown live.

import Link from "next/link";

type CurrentSeason = {
  id: string;
  season_number: number;
  start_at: string;
};

const TIER_LABELS: Record<string, string> = {
  master: "Maître",
  diamond: "Diamant",
  platinum: "Platine",
  gold: "Or",
  silver: "Argent",
  bronze: "Bronze",
};

function tierForElo(elo: number): string {
  if (elo >= 1600) return "master";
  if (elo >= 1400) return "diamond";
  if (elo >= 1200) return "platinum";
  if (elo >= 1000) return "gold";
  if (elo >= 800) return "silver";
  return "bronze";
}

export function SeasonBanner({
  gameId,
  season,
  myElo,
}: {
  gameId: string;
  season: CurrentSeason | null;
  myElo: number | null;
}) {
  if (!season) return null;
  const start = new Date(season.start_at).getTime();
  const end = start + 30 * 86400_000;
  const ms = Math.max(0, end - Date.now());
  const days = Math.floor(ms / 86400_000);
  const hours = Math.floor((ms % 86400_000) / 3600_000);
  const tier = myElo !== null ? tierForElo(myElo) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/40 bg-amber-300/5 px-4 py-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="text-base">📅</span>
        <span className="font-bold text-amber-100">
          Saison #{season.season_number}
        </span>
        <span className="text-amber-200/70">
          {days > 0 ? `~${days}j ${hours}h restants` : `~${hours}h restantes`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {myElo !== null && tier ? (
          <span className="text-zinc-200">
            ELO <span className="font-bold tabular-nums">{myElo}</span>
            {" · "}
            <span className="font-semibold">{TIER_LABELS[tier]}</span>
          </span>
        ) : (
          <span className="text-zinc-400">Non classé</span>
        )}
        <Link
          href={`/play/tcg/${gameId}/seasons`}
          className="rounded border border-amber-300/40 px-2 py-0.5 text-amber-200 transition-colors hover:bg-amber-300/10"
        >
          Voir →
        </Link>
      </div>
    </div>
  );
}

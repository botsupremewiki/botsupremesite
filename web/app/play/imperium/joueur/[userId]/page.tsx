import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { createClient } from "@/lib/supabase/server";
import { IMPERIUM_FACTIONS, formatNumber } from "@shared/imperium";

export const dynamic = "force-dynamic";

type PlayerProfile = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  power: number;
  villages: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    faction: "legion" | "horde" | "ordre";
    is_secondary: boolean;
  }>;
  alliance: {
    id: string;
    name: string;
    tag: string;
    color: string;
    role: string;
  } | null;
  stats: {
    kills_total?: number;
    losses_total?: number;
    loot_total?: number;
    power_max?: number;
    oasis_owned?: number;
  };
  achievements_count: number;
  last_login: string | null;
};

export default async function JoueurPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");

  const supabase = await createClient();
  const { data } = supabase
    ? await supabase.rpc("imperium_get_player_profile", { p_user_id: userId })
    : { data: null };

  if (!data) notFound();
  const player = data as PlayerProfile;
  const isMe = player.user_id === profile.id;
  const inactiveDays = player.last_login
    ? Math.floor(
        (Date.now() - new Date(player.last_login).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play/imperium"
            className="text-zinc-400 hover:text-zinc-100"
          >
            ← Imperium
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-zinc-200">
            👤 Profil joueur
          </span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.04),transparent_60%)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <section className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/40 p-4">
            {player.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.avatar_url}
                alt={player.username}
                className="h-16 w-16 rounded-full"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-zinc-100">
                  {player.username}
                </span>
                {player.alliance && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-bold text-zinc-900"
                    style={{ background: player.alliance.color }}
                  >
                    [{player.alliance.tag}]
                  </span>
                )}
                {isMe && (
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] text-amber-200">
                    Toi
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {player.villages.length} village
                {player.villages.length > 1 ? "s" : ""} ·{" "}
                {player.alliance ? `${player.alliance.role} de ${player.alliance.name}` : "Sans alliance"}
              </div>
              {inactiveDays != null && inactiveDays >= 7 && (
                <div className="mt-1 text-[10px] text-rose-300">
                  Inactif depuis {inactiveDays} jours — farmable sans bouclier
                  {inactiveDays >= 30 && " · conquérable"}
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Puissance"
              value={formatNumber(player.power)}
              accent="text-amber-200"
            />
            <Stat
              label="Puissance max"
              value={formatNumber(player.stats.power_max ?? 0)}
            />
            <Stat
              label="Succès"
              value={`${player.achievements_count} / 30`}
            />
            <Stat
              label="Oasis"
              value={`${player.stats.oasis_owned ?? 0}`}
            />
            <Stat
              label="Kills cumul"
              value={formatNumber(player.stats.kills_total ?? 0)}
            />
            <Stat
              label="Pertes cumul"
              value={formatNumber(player.stats.losses_total ?? 0)}
            />
            <Stat
              label="Loot cumul"
              value={formatNumber(player.stats.loot_total ?? 0)}
            />
          </section>

          <section>
            <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
              Villages ({player.villages.length})
            </div>
            <div className="flex flex-col gap-1">
              {player.villages.map((v) => {
                const faction = IMPERIUM_FACTIONS[v.faction];
                return (
                  <div
                    key={v.id}
                    className={`flex items-center gap-3 rounded border bg-white/[0.03] px-3 py-2 text-xs ${faction.border}`}
                  >
                    <span className={faction.accent}>{faction.glyph}</span>
                    <span className="text-zinc-100">{v.name}</span>
                    {v.is_secondary && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-zinc-400">
                        secondaire
                      </span>
                    )}
                    <span className="ml-auto tabular-nums text-zinc-500">
                      ({v.x}, {v.y})
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {!isMe && (
            <Link
              href="/play/imperium"
              className="self-start text-xs text-zinc-400 hover:text-zinc-200"
            >
              ← Retour
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          accent ?? "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

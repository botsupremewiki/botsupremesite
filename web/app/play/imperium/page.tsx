import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { createClient } from "@/lib/supabase/server";
import { fetchImperiumVillages } from "./_lib/supabase-helpers";
import { IMPERIUM_FACTIONS } from "@shared/imperium";
import { IncomingAttacksAlert } from "./_components/incoming-attacks-alert";

export const dynamic = "force-dynamic";

const ACHIEVEMENTS_TOTAL = 30;

export default async function ImperiumHub() {
  const profile = await getProfile();

  if (!profile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            Connecte-toi avec Discord pour fonder ton village.
          </div>
        </main>
      </div>
    );
  }

  const villages = await fetchImperiumVillages(profile.id);

  // Pas encore de village → flow création
  if (villages.length === 0) {
    redirect("/play/imperium/creation");
  }

  const main = villages.find((v) => !v.is_secondary) ?? villages[0];
  const faction = IMPERIUM_FACTIONS[main.faction];

  // Compteurs UI (achievements + rapports unread)
  const supabase = await createClient();
  let achievementsUnlocked = 0;
  let reportsUnread = 0;
  if (supabase) {
    const [ach, repAtt, repDef] = await Promise.all([
      supabase
        .from("imperium_achievements")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id),
      supabase
        .from("imperium_reports")
        .select("*", { count: "exact", head: true })
        .eq("attacker_user_id", profile.id)
        .eq("read_by_attacker", false),
      supabase
        .from("imperium_reports")
        .select("*", { count: "exact", head: true })
        .eq("defender_user_id", profile.id)
        .eq("read_by_defender", false),
    ]);
    achievementsUnlocked = ach.count ?? 0;
    reportsUnread = (repAtt.count ?? 0) + (repDef.count ?? 0);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header profile={profile} />

      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)] p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <IncomingAttacksAlert />
          <div
            className={`rounded-xl border bg-black/40 p-4 ${faction.border} ${faction.gradient}`}
          >
            <div className="text-[11px] uppercase tracking-widest text-zinc-400">
              Faction
            </div>
            <div className={`mt-1 text-xl font-bold ${faction.accent}`}>
              {faction.glyph} {faction.name}
            </div>
            <div className="mt-1 text-xs text-zinc-400">{faction.role}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {villages.map((v) => (
              <Link
                key={v.id}
                href={`/play/imperium/${v.id}`}
                className="rounded-xl border border-white/10 bg-black/40 p-4 hover:bg-white/[0.04]"
              >
                <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {v.is_secondary ? "Village secondaire" : "Village principal"}
                </div>
                <div className="mt-0.5 text-lg font-bold text-zinc-100">
                  {v.name}
                </div>
                <div className="mt-1 text-xs text-zinc-400 tabular-nums">
                  ({v.x}, {v.y})
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] tabular-nums">
                  <Res label="🪵" value={v.wood} />
                  <Res label="🧱" value={v.clay} />
                  <Res label="⛓️" value={v.iron} />
                  <Res label="🌾" value={v.wheat} />
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuButton
              href={`/play/imperium/${main.id}/carte`}
              icon="🗺️"
              title="Carte monde"
              description="Explore la grille 100×100, repère oasis et barbares"
              accent="text-emerald-200"
              border="border-emerald-400/40"
            />
            <MenuButton
              href={`/play/imperium/${main.id}/marches`}
              icon="🚶"
              title="Marches & rapports"
              description="Suis tes marches, lis tes rapports de combat"
              accent="text-rose-200"
              border="border-rose-400/40"
              badge={reportsUnread > 0 ? `${reportsUnread} non lu${reportsUnread > 1 ? "s" : ""}` : undefined}
            />
            <MenuButton
              href={`/play/imperium/alliance`}
              icon="🤝"
              title="Alliance"
              description="Membres, chat, diplomatie"
              accent="text-violet-200"
              border="border-violet-400/40"
            />
            <MenuButton
              href={`/play/imperium/${main.id}/marche`}
              icon="💰"
              title="Marché"
              description="Échange tes ressources avec d'autres joueurs"
              accent="text-amber-200"
              border="border-amber-400/40"
            />
            <MenuButton
              href={`/play/imperium/classement`}
              icon="🏆"
              title="Classements"
              description="Top hebdo · Hall of Fame"
              accent="text-yellow-200"
              border="border-yellow-400/40"
            />
            <MenuButton
              href={`/play/imperium/quetes`}
              icon="📋"
              title="Quêtes & Succès"
              description="Quêtes journalières · 30 succès"
              accent="text-sky-200"
              border="border-sky-400/40"
              badge={`${achievementsUnlocked}/${ACHIEVEMENTS_TOTAL}`}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Header({
  profile,
}: {
  profile?: { id: string; gold: number; username: string; avatar_url: string | null; is_admin: boolean };
}) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <Link
          href="/play"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← Plaza
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <span className="font-semibold text-amber-200">🏰 Imperium</span>
        <span className="text-xs text-zinc-500">
          Stratégie médiévale persistante
        </span>
      </div>
      {profile ? (
        <UserPill profile={profile} variant="play" />
      ) : (
        <span className="text-xs text-zinc-500">Invité</span>
      )}
    </header>
  );
}

function Res({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.03] px-1.5 py-1">
      <div className="text-[9px] text-zinc-500">{label}</div>
      <div className="text-zinc-200">
        {Math.floor(value).toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

function MenuButton({
  href,
  icon,
  title,
  description,
  accent,
  border,
  badge,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
  border: string;
  badge?: string;
}) {
  return (
    <Link href={href}>
      <div
        className={`relative flex h-full flex-col gap-2 rounded-xl border p-5 transition-colors ${border} bg-black/40 hover:bg-white/[0.04]`}
      >
        {badge && (
          <span className="absolute right-3 top-3 rounded-full bg-amber-500/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
            {badge}
          </span>
        )}
        <div className="text-3xl">{icon}</div>
        <div className={`text-base font-semibold ${accent}`}>{title}</div>
        <div className="text-[11px] leading-relaxed text-zinc-400">
          {description}
        </div>
      </div>
    </Link>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ETERNUM_CLASSES, ETERNUM_ELEMENTS } from "@shared/types";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "./_lib/supabase-helpers";

export const dynamic = "force-dynamic";

export default async function EternumHub() {
  const profile = await getProfile();
  const hero = profile ? await fetchEternumHero(profile.id) : null;

  // Si connecté sans héros → redirige vers création.
  if (profile && !hero) {
    redirect("/play/rpg/personnage");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-amber-200">⚔️ Eternum</span>
          <span className="text-xs text-zinc-500">
            RPG idle · 6 classes · 540 familiers
          </span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>

      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.08),transparent_60%)] p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {!profile && (
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
              Connecte-toi avec Discord pour créer ton héros et commencer
              l&apos;aventure.
            </div>
          )}

          {profile && hero && (
            <StatsBanner profile={profile} hero={hero} />
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MenuButton
              href="/play/rpg/personnage"
              icon="🦸"
              title="Personnage"
              description={
                hero
                  ? `${ETERNUM_CLASSES[hero.classId].name} ${ETERNUM_ELEMENTS[hero.elementId].glyph} · niveau ${hero.level}`
                  : "Crée ton héros (classe + élément)"
              }
              accent="text-amber-200"
              border="border-amber-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]"
              highlight={!hero}
            />
            <MenuButton
              href="/play/rpg/familiers"
              icon="🐾"
              title="Familiers"
              description="Collection · équipe · invocation · auberge"
              accent="text-violet-200"
              border="border-violet-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.10),transparent_70%)]"
            />
            <MenuButton
              href="/play/rpg/aventure"
              icon="🌀"
              title="Aventure"
              description="Idle · stages auto · ressources basse qualité"
              accent="text-sky-200"
              border="border-sky-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.10),transparent_70%)]"
            />
            <MenuButton
              href="/play/rpg/combats"
              icon="⚔️"
              title="Combats"
              description="Donjons · Raids · Bot Suprême · PvP · Défis"
              accent="text-rose-200"
              border="border-rose-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.10),transparent_70%)]"
            />
            <MenuButton
              href="/play/rpg/social"
              icon="👥"
              title="Social"
              description="Guilde · amis · classements"
              accent="text-emerald-200"
              border="border-emerald-400/40"
              gradient="bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.10),transparent_70%)]"
            />
          </div>

          <div className="rounded-xl border border-white/5 bg-black/30 p-4 text-xs text-zinc-400">
            <p className="font-semibold text-zinc-300">À propos d&apos;Eternum</p>
            <p className="mt-1 leading-relaxed">
              RPG idle où tu choisis 1 héros (classe + élément), constitues
              une équipe de 5 familiers et progresses via combat
              auto/tour-par-tour. Raids héros-only · World Boss
              familiers-only · 6 métiers de craft · 5 raretés (commun →
              prismatique). Phase 1 : tu peux créer ton héros et farmer en
              idle pour gagner OS et XP.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatsBanner({
  profile,
  hero,
}: {
  profile: { gold: number };
  hero: import("@shared/types").EternumHero;
}) {
  const cls = ETERNUM_CLASSES[hero.classId];
  const elt = ETERNUM_ELEMENTS[hero.elementId];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile
        label="Or Suprême"
        value={profile.gold.toLocaleString("fr-FR")}
        accent="text-amber-300"
      />
      <StatTile
        label="Énergie"
        value={`${hero.energy} / 100`}
        accent={hero.energy >= 50 ? "text-emerald-300" : "text-zinc-100"}
      />
      <StatTile
        label="Héros"
        value={`${cls.glyph} ${cls.name}`}
        suffix={`${elt.glyph} ${elt.name}`}
        accent={cls.accent}
      />
      <StatTile
        label="Niveau"
        value={String(hero.level)}
        suffix={hero.prestigeCount > 0 ? `· P${hero.prestigeCount}` : undefined}
        accent="text-zinc-100"
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-widest text-zinc-400">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${accent}`}>
        {value}
        {suffix && (
          <span className="ml-1 text-xs font-normal text-zinc-400">
            {suffix}
          </span>
        )}
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
  gradient,
  highlight,
  soon,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  accent: string;
  border: string;
  gradient: string;
  highlight?: boolean;
  soon?: boolean;
}) {
  const inner = (
    <div
      className={`relative flex h-full flex-col gap-2 rounded-xl border p-5 transition-colors ${
        soon
          ? "border-white/10 opacity-60"
          : `${border} bg-black/40 hover:bg-white/[0.04]`
      } ${gradient} ${highlight ? "ring-1 ring-amber-400/30" : ""}`}
    >
      {soon && (
        <span className="absolute right-3 top-3 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-300">
          Bientôt
        </span>
      )}
      <div className="text-3xl">{icon}</div>
      <div className={`text-base font-semibold ${accent}`}>{title}</div>
      <div className="text-[11px] leading-relaxed text-zinc-400">
        {description}
      </div>
    </div>
  );
  if (soon) return <div>{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}

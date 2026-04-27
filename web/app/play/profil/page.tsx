import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { CustomizeForm } from "../personnaliser/customize-form";
import { ACHIEVEMENTS } from "@shared/achievements";

export const dynamic = "force-dynamic";

type ProgressRow = {
  achievement_id: string;
  unlocked_at: string | null;
};

type DailyStatusRow = {
  current_streak: number;
  total_claimed: number;
};

export default async function ProfilPage() {
  const profile = await getProfile();
  if (!profile)
    return (
      <p className="p-6 text-zinc-400">Connecte-toi pour voir ton profil.</p>
    );

  const supabase = await createClient();
  let progressRows: ProgressRow[] = [];
  let dailyStatus: DailyStatusRow | null = null;
  if (supabase) {
    const [achievements, daily] = await Promise.all([
      supabase
        .from("achievements_progress")
        .select("achievement_id,unlocked_at")
        .eq("user_id", profile.id),
      supabase
        .from("daily_rewards")
        .select("streak_count,total_claimed")
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]);
    progressRows = (achievements.data ?? []) as ProgressRow[];
    if (daily.data) {
      dailyStatus = {
        current_streak: (daily.data as { streak_count?: number }).streak_count ?? 0,
        total_claimed: (daily.data as { total_claimed?: number }).total_claimed ?? 0,
      };
    }
  }
  const unlocked = progressRows.filter((r) => r.unlocked_at != null).length;
  const totalAchievements = ACHIEVEMENTS.length;

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
          <span className="font-semibold">👤 Profil</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.06),transparent_60%)] p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {/* ─── Bandeau identité ─── */}
          <section className="rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-bold text-amber-200">
                  {profile.username}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {profile.gold.toLocaleString("fr-FR")} OS
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-right">
                <Stat
                  label="Achievements"
                  value={`${unlocked}/${totalAchievements}`}
                  href="/play/objectifs"
                />
                <Stat
                  label="Streak"
                  value={
                    dailyStatus
                      ? `${dailyStatus.current_streak}/30`
                      : "0/30"
                  }
                />
                <Stat
                  label="Cumul daily"
                  value={`${(dailyStatus?.total_claimed ?? 0).toLocaleString("fr-FR")} OS`}
                />
              </div>
            </div>
          </section>

          {/* ─── Customisation avatar ─── */}
          <section className="rounded-xl border border-white/10 bg-black/30 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-zinc-200">
                  🎨 Personnaliser l&apos;avatar
                </div>
                <div className="text-xs text-zinc-500">
                  Aperçu en temps réel · sauvegarde directe
                </div>
              </div>
            </div>
            <CustomizeForm
              userId={profile.id}
              username={profile.username}
              initialAppearance={profile.appearance ?? null}
            />
          </section>

          {/* ─── Liens rapides ─── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <QuickLink
              href="/play/objectifs"
              icon="🎯"
              title="Objectifs"
              body="Récompense quotidienne, achievements et quêtes globales."
            />
            <QuickLink
              href="/play/amis"
              icon="👥"
              title="Amis"
              body="Liste, demandes en attente, ajouter de nouveaux amis."
            />
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-2">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-sm font-bold text-zinc-100 tabular-nums">
        {value}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="transition-transform hover:scale-105">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickLink({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/20 hover:bg-white/5"
    >
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-400">{body}</div>
      </div>
    </Link>
  );
}

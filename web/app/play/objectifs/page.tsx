import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { DailyRewardCard } from "@/components/daily-reward-card";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_CATEGORY,
  CATEGORY_LABEL,
  type AchievementCategory,
} from "@shared/achievements";

export const dynamic = "force-dynamic";

type ProgressRow = {
  achievement_id: string;
  progress: number;
  unlocked_at: string | null;
};

export default async function ObjectifsPage() {
  const profile = await getProfile();
  if (!profile)
    return (
      <p className="p-6 text-zinc-400">Connecte-toi pour voir tes objectifs.</p>
    );

  const supabase = await createClient();
  let progressRows: ProgressRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("achievements_progress")
      .select("achievement_id,progress,unlocked_at")
      .eq("user_id", profile.id);
    progressRows = (data ?? []) as ProgressRow[];
  }
  const progressMap = new Map(progressRows.map((r) => [r.achievement_id, r]));

  const total = ACHIEVEMENTS.length;
  const unlocked = ACHIEVEMENTS.filter(
    (a) => progressMap.get(a.id)?.unlocked_at != null,
  ).length;
  const percent = Math.round((unlocked / total) * 100);

  const categories: AchievementCategory[] = [
    "global",
    "casino",
    "eternum",
    "imperium",
    "skyline",
  ];

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
          <span className="font-semibold text-amber-200">🎯 Objectifs</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {/* ───── Daily reward — top ───── */}
          <DailyRewardCard />

          {/* ───── Achievements summary ───── */}
          <section className="rounded-xl border border-white/10 bg-black/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Achievements
                </div>
                <div className="text-2xl font-bold text-amber-200">
                  {unlocked} / {total}
                </div>
                <div className="text-xs text-zinc-400">
                  {ACHIEVEMENTS.filter(
                    (a) => progressMap.get(a.id)?.unlocked_at != null,
                  ).reduce((s, a) => s + a.osReward, 0).toLocaleString("fr-FR")}
                  {" OS gagnés via achievements"}
                </div>
              </div>
              <div className="h-2 w-40 rounded-full bg-white/5">
                <div
                  className="h-2 rounded-full bg-amber-400/80"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          </section>

          {/* ───── Achievements par catégorie ───── */}
          {categories.map((cat) => {
            const items = ACHIEVEMENTS_BY_CATEGORY[cat];
            if (items.length === 0) return null;
            const catUnlocked = items.filter(
              (a) => progressMap.get(a.id)?.unlocked_at != null,
            ).length;
            return (
              <section
                key={cat}
                className="rounded-xl border border-white/10 bg-black/40 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-bold text-zinc-200">
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    {catUnlocked} / {items.length}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((a) => {
                    const p = progressMap.get(a.id);
                    const unlockedAt = p?.unlocked_at ?? null;
                    const cur = p?.progress ?? 0;
                    const ratio = Math.min(1, cur / a.required);
                    return (
                      <div
                        key={a.id}
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          unlockedAt
                            ? "border-amber-400/50 bg-amber-400/[0.06]"
                            : "border-white/10 bg-white/[0.02]"
                        }`}
                      >
                        <div
                          className={`text-3xl ${
                            unlockedAt ? "" : "grayscale opacity-40"
                          }`}
                        >
                          {a.glyph}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div
                              className={`truncate text-sm font-semibold ${
                                unlockedAt
                                  ? "text-amber-200"
                                  : "text-zinc-300"
                              }`}
                            >
                              {a.name}
                            </div>
                            <div className="text-[10px] tabular-nums text-zinc-500">
                              +{a.osReward} OS
                            </div>
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {a.description}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 flex-1 rounded-full bg-white/5">
                              <div
                                className={`h-1 rounded-full ${
                                  unlockedAt
                                    ? "bg-amber-400"
                                    : "bg-emerald-400/60"
                                }`}
                                style={{ width: `${ratio * 100}%` }}
                              />
                            </div>
                            <div className="text-[10px] tabular-nums text-zinc-500">
                              {cur.toLocaleString("fr-FR")} /{" "}
                              {a.required.toLocaleString("fr-FR")}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

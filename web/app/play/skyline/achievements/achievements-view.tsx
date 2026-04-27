"use client";

import {
  SKYLINE_ACHIEVEMENTS,
  type SkylineAchievementId,
} from "@shared/skyline";

const ALL_IDS = Object.keys(SKYLINE_ACHIEVEMENTS) as SkylineAchievementId[];

export function AchievementsView({
  unlocked,
}: {
  unlocked: SkylineAchievementId[];
}) {
  const unlockedSet = new Set(unlocked);
  const unlockedCount = unlocked.length;
  const total = ALL_IDS.length;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_60%)] p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">🏆 Achievements</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tes réussites en tant que magnat Skyline.{" "}
            <strong className="text-amber-200">
              {unlockedCount} / {total}
            </strong>{" "}
            débloqué(s).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_IDS.map((id) => {
            const meta = SKYLINE_ACHIEVEMENTS[id];
            const isUnlocked = unlockedSet.has(id);
            return (
              <div
                key={id}
                className={`rounded-lg border p-4 ${
                  isUnlocked
                    ? "border-amber-400/40 bg-amber-500/10"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`text-3xl ${isUnlocked ? "" : "opacity-30 grayscale"}`}
                  >
                    {meta.glyph}
                  </div>
                  <div>
                    <div
                      className={`text-sm font-semibold ${
                        isUnlocked ? "text-amber-200" : "text-zinc-400"
                      }`}
                    >
                      {meta.name}
                      {isUnlocked ? (
                        <span className="ml-2 text-[10px] text-emerald-300">
                          ✓
                        </span>
                      ) : null}
                    </div>
                    <div
                      className={`mt-1 text-[11px] ${
                        isUnlocked ? "text-zinc-300" : "text-zinc-500"
                      }`}
                    >
                      {meta.description}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

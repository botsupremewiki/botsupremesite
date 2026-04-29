import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EternumHero } from "@shared/types";

export type EternumHeroRow = {
  user_id: string;
  class_id: string;
  element_id: string;
  job_id: string | null;
  level: number;
  xp: number | string;
  evolution_stage: number;
  prestige_count: number;
  prestige_stones: number;
  energy: number;
  energy_updated_at: string;
  idle_stage: number;
  idle_updated_at: string;
};

/** Recompute energy server-side then return the fresh hero row.
 *  Returns null if the user has no hero yet. */
export async function fetchEternumHero(
  authId: string,
): Promise<EternumHero | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  // Recompute énergie au login (idempotent côté DB).
  await supabase.rpc("eternum_recompute_energy", { p_user_id: authId });

  const { data } = await supabase
    .from("eternum_heroes")
    .select(
      "user_id,class_id,element_id,job_id,level,xp,evolution_stage,prestige_count,prestige_stones,energy,energy_updated_at,idle_stage,idle_updated_at",
    )
    .eq("user_id", authId)
    .maybeSingle();
  if (!data) return null;
  return rowToHero(data as EternumHeroRow);
}

function rowToHero(row: EternumHeroRow): EternumHero {
  return {
    classId: row.class_id as EternumHero["classId"],
    elementId: row.element_id as EternumHero["elementId"],
    jobId: (row.job_id ?? null) as EternumHero["jobId"],
    level: row.level,
    xp: typeof row.xp === "string" ? Number(row.xp) : row.xp,
    evolutionStage: row.evolution_stage,
    prestigeCount: row.prestige_count,
    prestigeStones: row.prestige_stones ?? 0,
    energy: row.energy,
    energyUpdatedAt: Date.parse(row.energy_updated_at) || Date.now(),
    idleStage: row.idle_stage,
    idleUpdatedAt: Date.parse(row.idle_updated_at) || Date.now(),
  };
}

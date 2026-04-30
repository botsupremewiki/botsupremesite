import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EternumHero } from "@shared/types";
import type {
  OwnedEquippedItem,
  OwnedTeamFamilier,
} from "@shared/eternum-loadout";

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

  // SELECT principal sans prestige_stones — robuste si la migration F2
  // n'a pas encore été appliquée côté Supabase. Sinon le SELECT plante en
  // erreur 42703 et on bloque l'utilisateur sur la page de création.
  const { data } = await supabase
    .from("eternum_heroes")
    .select(
      "user_id,class_id,element_id,job_id,level,xp,evolution_stage,prestige_count,energy,energy_updated_at,idle_stage,idle_updated_at",
    )
    .eq("user_id", authId)
    .maybeSingle();
  if (!data) return null;

  // SELECT séparé pour prestige_stones, best-effort. Si colonne absente,
  // l'erreur est silencieusement ignorée et on retombe sur 0.
  let prestigeStones = 0;
  try {
    const r = await supabase
      .from("eternum_heroes")
      .select("prestige_stones")
      .eq("user_id", authId)
      .maybeSingle();
    prestigeStones =
      ((r.data as { prestige_stones?: number } | null)?.prestige_stones ?? 0);
  } catch {
    // colonne absente — migration F2 pas appliquée, on tolère
  }

  return rowToHero(
    { ...(data as Omit<EternumHeroRow, "prestige_stones">), prestige_stones: prestigeStones },
  );
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

/** Charge les familiers actifs du joueur (team_slot non-null) triés par slot. */
export async function fetchEternumTeam(
  userId: string,
): Promise<OwnedTeamFamilier[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("eternum_familiers_owned")
    .select("id,familier_id,element_id,level,team_slot")
    .eq("user_id", userId)
    .not("team_slot", "is", null)
    .order("team_slot", { ascending: true });
  return (data ?? []) as OwnedTeamFamilier[];
}

/** Charge tous les items équipés du joueur (sur héros ou familier). */
export async function fetchEternumEquippedItems(
  userId: string,
): Promise<OwnedEquippedItem[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("eternum_items_owned")
    .select("id,item_id,equipped_on_hero,equipped_on_familier")
    .eq("user_id", userId)
    .or("equipped_on_hero.eq.true,equipped_on_familier.not.is.null");
  return (data ?? []) as OwnedEquippedItem[];
}

/** Charge tout ce qu'il faut pour un combat : héros + team + items. */
export async function fetchEternumCombatBundle(userId: string): Promise<{
  hero: EternumHero | null;
  team: OwnedTeamFamilier[];
  items: OwnedEquippedItem[];
}> {
  const [hero, team, items] = await Promise.all([
    fetchEternumHero(userId),
    fetchEternumTeam(userId),
    fetchEternumEquippedItems(userId),
  ]);
  return { hero, team, items };
}

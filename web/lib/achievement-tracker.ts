import type { SupabaseClient } from "@supabase/supabase-js";
import { ACHIEVEMENTS_BY_ID } from "@shared/achievements";

/**
 * Pousse +amount sur un achievement et retourne {unlocked, os_gained}.
 * Idempotent côté serveur — débloquer 2× ne re-notifie pas.
 *
 * Récupère required + osReward du catalogue côté client (server n'a que l'id).
 */
export async function trackAchievement(
  supabase: SupabaseClient | null,
  achievementId: string,
  amount: number = 1,
): Promise<{ unlocked: boolean; osGained: number } | null> {
  if (!supabase) return null;
  const def = ACHIEVEMENTS_BY_ID.get(achievementId);
  if (!def) {
    console.warn(`[achievements] unknown id: ${achievementId}`);
    return null;
  }
  const { data, error } = await supabase.rpc("achievement_progress", {
    p_achievement_id: achievementId,
    p_amount: amount,
    p_required: def.required,
    p_os_reward: def.osReward,
  });
  if (error) {
    console.warn(`[achievements] error tracking ${achievementId}:`, error.message);
    return null;
  }
  const r = data as
    | { ok: true; unlocked: boolean; os_gained?: number }
    | { ok: false };
  if (!r.ok) return null;
  return {
    unlocked: !!r.unlocked,
    osGained: r.os_gained ?? 0,
  };
}

/** Track "global.first-login" — appelé sur la plaza au premier load. */
export async function trackFirstLogin(supabase: SupabaseClient | null) {
  return trackAchievement(supabase, "global.first-login", 1);
}

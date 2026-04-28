"use server";

import { revalidatePath } from "next/cache";
import { getProfile, getUser } from "@/lib/auth";
import {
  resyncAllProfilesFromBot,
  resyncProfileFromBot,
  type BotResyncResult,
  type BulkResyncSummary,
} from "@/lib/discord-bot-fetch";

/**
 * Resynchronise le profil de l'utilisateur courant depuis Discord, sans
 * passer par un nouveau login. Utilise le bot token, donc fonctionne tant
 * que le joueur s'est déjà connecté au moins une fois (pour avoir un
 * `discord_id` stocké).
 *
 * Appelée depuis le bouton "Resynchroniser" du menu profil.
 */
export async function resyncMyDiscordProfile(): Promise<BotResyncResult> {
  const user = await getUser();
  if (!user) {
    return { ok: false, profileId: "", reason: "Non authentifié" };
  }
  const result = await resyncProfileFromBot(user.id);
  // Le pseudo, l'avatar et les rôles ont peut-être changé → invalide les
  // caches qui dépendent du profil pour que la prochaine nav recharge.
  if (result.ok) {
    revalidatePath("/", "layout");
  }
  return result;
}

/**
 * Resync de masse, réservée aux admins du site (vérification serveur via
 * `is_admin` du profil — qui est lui-même dérivé du rôle Discord ADMIN,
 * cf. shared/discord-roles.ts).
 *
 * Itère sur tous les profils qui ont un `discord_id` et les met à jour.
 * Utile après ajout d'un nouveau rôle Discord, ou si tu veux forcer
 * l'application des dernières règles à tout le monde.
 */
export async function resyncAllDiscordProfiles(): Promise<BulkResyncSummary> {
  const profile = await getProfile();
  if (!profile?.is_admin) {
    return {
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [{ profileId: "*", reason: "Réservé aux admins" }],
    };
  }
  const summary = await resyncAllProfilesFromBot();
  // Les profils des autres joueurs ont possiblement changé — invalide
  // largement pour que les pages admin/profils reloadent.
  revalidatePath("/", "layout");
  return summary;
}

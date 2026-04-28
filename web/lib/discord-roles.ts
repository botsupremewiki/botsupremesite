// Wrapper web autour de `shared/discord-roles` qui expose un helper
// `hasRole(profile, "BOOSTER")` accolé au type Profile du site.
//
// La source de vérité (IDs des rôles) vit dans `shared/discord-roles.ts`
// pour être partagée avec les serveurs PartyKit.

import {
  DISCORD_ROLES,
  type DiscordRoleName,
  deriveRoleFlags,
  hasRoleId,
} from "@shared/discord-roles";

export { DISCORD_ROLES, deriveRoleFlags, hasRoleId };
export type { DiscordRoleName };

/** Variante qui prend un Profile au lieu d'un tableau de rôles brut. */
export function hasRole(
  profile: { discord_roles?: string[] | null } | null | undefined,
  role: DiscordRoleName,
): boolean {
  return hasRoleId(profile?.discord_roles, role);
}

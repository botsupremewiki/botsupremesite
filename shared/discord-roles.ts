// Mapping des rôles Discord vers leurs effets côté site.
//
// Centralisé dans `shared/` pour pouvoir être importé à la fois depuis
// `web/` (pages, components) et `party/` (serveurs PartyKit) — ces deux
// modules ont besoin de connaître la même source de vérité.
//
// Pour ajouter un nouveau rôle :
//   1. Active le mode développeur Discord (Paramètres → Avancés)
//   2. Server settings → Roles → clic droit → Copy Role ID
//   3. Ajoute l'entrée dans DISCORD_ROLES ci-dessous
//   4. Utilise `deriveRoleFlags(roles)` ou `hasRoleId(roles, "<NOM>")` côté code
//
// Les IDs ne sont pas secrets (juste des snowflakes Discord), donc on peut
// les commiter sans problème. Seul le bot token / service role doivent
// rester dans .env.

export const DISCORD_ROLES = {
  ADMIN: "1441539810069053440",
  BOOSTER: "1463369524769460314",
} as const;

export type DiscordRoleName = keyof typeof DISCORD_ROLES;

/**
 * Vérifie si une liste d'IDs de rôles contient un rôle donné.
 * Tolère `null`/`undefined` (joueur dont la sync n'a pas eu lieu) en
 * renvoyant `false` plutôt qu'en plantant.
 */
export function hasRoleId(
  roles: string[] | null | undefined,
  role: DiscordRoleName,
): boolean {
  if (!roles) return false;
  return roles.includes(DISCORD_ROLES[role]);
}

/**
 * À partir d'un tableau d'IDs Discord, dérive les flags utilisés par le
 * site (admin, booster, …). Centralisé pour qu'il n'y ait qu'un seul
 * endroit à toucher quand on ajoute un nouveau rôle.
 */
export function deriveRoleFlags(roles: string[] | null | undefined) {
  return {
    isAdmin: hasRoleId(roles, "ADMIN"),
    isBooster: hasRoleId(roles, "BOOSTER"),
  };
}

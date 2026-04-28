import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { deriveRoleFlags } from "@shared/discord-roles";

// Récupère le pseudo serveur Discord du joueur (et son nom global) puis
// synchronise les colonnes `username`, `discord_nick`, `discord_global_name`,
// `avatar_url` et `discord_synced_at` dans la table `profiles`.
//
// Stratégie d'affichage : `username` = nick serveur > nom global Discord >
// valeur précédente. Comme tout le site lit `profile.username`, ça suffit
// pour faire apparaître le pseudo serveur partout (chat, plaza, etc.).
//
// Appelée depuis `/auth/callback` après l'échange du code OAuth, donc une
// fois par session. Discord limite l'endpoint à quelques req/s par token,
// largement suffisant.

type DiscordMember = {
  nick: string | null;
  avatar: string | null; // hash de l'avatar serveur (optionnel)
  user: {
    id: string;
    username: string; // nom global Discord (ex: "botsupreme")
    global_name: string | null; // nouveau "display name" Discord
    avatar: string | null;
  };
  roles: string[];
};

export type DiscordSyncResult = {
  ok: boolean;
  username?: string;
  discord_nick?: string | null;
  discord_global_name?: string | null;
  discord_roles?: string[];
  is_admin?: boolean;
  reason?: string;
};

export async function syncDiscordProfile(
  userId: string,
  providerToken: string,
): Promise<DiscordSyncResult> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    return { ok: false, reason: "DISCORD_GUILD_ID non configuré" };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, reason: "Supabase service role manquant" };
  }

  // 1. Appel Discord — l'endpoint marche uniquement avec le scope
  //    `guilds.members.read` accordé via OAuth. Si le joueur n'est pas
  //    dans le serveur, Discord renvoie 404 → on retombe sur les infos
  //    globales du provider sans casser le login.
  let member: DiscordMember | null = null;
  let discordUserId: string | null = null;
  let globalUsername: string | null = null;
  let globalDisplayName: string | null = null;
  let avatarUrl: string | null = null;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
      {
        headers: { Authorization: `Bearer ${providerToken}` },
        cache: "no-store",
      },
    );
    if (res.ok) {
      member = (await res.json()) as DiscordMember;
      discordUserId = member.user.id;
      globalUsername = member.user.username;
      globalDisplayName = member.user.global_name;
      // Avatar serveur si présent, sinon avatar global, sinon rien.
      if (member.avatar) {
        avatarUrl = `https://cdn.discordapp.com/guilds/${guildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=128`;
      } else if (member.user.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`;
      }
    } else {
      // 404 = pas membre du serveur. 401 = token invalide ou scope manquant.
      // On continue sans info serveur, on tentera quand même de récupérer
      // le profil global via /users/@me.
      const ures = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${providerToken}` },
        cache: "no-store",
      });
      if (ures.ok) {
        const u = (await ures.json()) as DiscordMember["user"];
        discordUserId = u.id;
        globalUsername = u.username;
        globalDisplayName = u.global_name;
        if (u.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`;
        }
      } else {
        return { ok: false, reason: `Discord API ${res.status}` };
      }
    }
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${(e as Error).message}` };
  }

  // 2. Choix du pseudo final affiché sur le site.
  //    Priorité : nick serveur → display name Discord → username global.
  const displayName =
    member?.nick?.trim() ||
    globalDisplayName?.trim() ||
    globalUsername?.trim() ||
    null;

  if (!displayName) {
    return { ok: false, reason: "aucun nom Discord récupéré" };
  }

  // 3. Rôles Discord → flags site (`is_admin`, `is_booster`, …).
  //    On stocke aussi la liste brute pour pouvoir checker n'importe quel
  //    rôle plus tard sans re-sync.
  const roles = member?.roles ?? [];
  const flags = deriveRoleFlags(roles);

  // 4. Update Supabase via service role (le client SSR du joueur n'aurait
  //    pas le droit d'écrire `discord_synced_at` ni `is_admin` à cause
  //    des RLS).
  const supabase = createServiceClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const update: Record<string, unknown> = {
    username: displayName,
    discord_id: discordUserId,
    discord_nick: member?.nick ?? null,
    discord_global_name: globalDisplayName ?? globalUsername ?? null,
    discord_roles: roles,
    is_admin: flags.isAdmin,
    discord_synced_at: new Date().toISOString(),
  };
  if (avatarUrl) update.avatar_url = avatarUrl;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    return { ok: false, reason: `supabase update: ${error.message}` };
  }

  return {
    ok: true,
    username: displayName,
    discord_nick: member?.nick ?? null,
    discord_global_name: globalDisplayName ?? globalUsername ?? null,
    discord_roles: roles,
    is_admin: flags.isAdmin,
  };
}

import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { deriveRoleFlags } from "@shared/discord-roles";

// Resync d'un profil sans avoir besoin de la session Discord du joueur :
// on appelle l'API Discord avec le **bot token** de l'app, qui peut lire
// les members du serveur sans intent privilégié (un member à la fois via
// `/guilds/{id}/members/{user_id}`).
//
// Cas d'usage :
//   1. Bouton "Resynchroniser" dans le menu profil — refresh sans logout
//   2. Page admin /admin/sync-roles — sync de masse pour tous les profils
//
// Pour la sync au login (où on a le provider_token du joueur), on continue
// d'utiliser `discord-sync.ts` qui fait moins d'allers-retours.

type BotMember = {
  nick: string | null;
  avatar: string | null;
  user: {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };
  roles: string[];
};

export type BotResyncResult = {
  ok: boolean;
  profileId: string;
  username?: string;
  is_admin?: boolean;
  reason?: string;
};

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!url || !serviceKey) {
    return { ok: false as const, reason: "Supabase service role manquant" };
  }
  if (!guildId) return { ok: false as const, reason: "DISCORD_GUILD_ID manquant" };
  if (!botToken) return { ok: false as const, reason: "DISCORD_BOT_TOKEN manquant" };
  return { ok: true as const, url, serviceKey, guildId, botToken };
}

/**
 * Resync un profil donné depuis Discord en utilisant le bot token.
 *
 * Le profil est identifié par son UUID Supabase (`profileId`) — on remonte
 * son `discord_id` via la DB. Si le joueur n'a pas encore de `discord_id`
 * (cas où il s'est jamais loggé après le déploiement de Chunk A), on
 * renvoie une erreur explicite plutôt que d'écraser ses données.
 */
export async function resyncProfileFromBot(
  profileId: string,
): Promise<BotResyncResult> {
  const env = getEnv();
  if (!env.ok) {
    return { ok: false, profileId, reason: env.reason };
  }

  const supabase = createServiceClient(env.url, env.serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Récupère le discord_id stocké lors du dernier login OAuth.
  const { data: row, error: fetchErr } = await supabase
    .from("profiles")
    .select("discord_id")
    .eq("id", profileId)
    .single();

  if (fetchErr || !row?.discord_id) {
    return {
      ok: false,
      profileId,
      reason: "discord_id manquant (le joueur doit se reconnecter une fois)",
    };
  }

  // 2. Appel Discord avec le bot token.
  let member: BotMember;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${env.guildId}/members/${row.discord_id}`,
      {
        headers: { Authorization: `Bot ${env.botToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      return {
        ok: false,
        profileId,
        reason: `Discord API ${res.status} (joueur pas dans le serveur ?)`,
      };
    }
    member = (await res.json()) as BotMember;
  } catch (e) {
    return {
      ok: false,
      profileId,
      reason: `fetch failed: ${(e as Error).message}`,
    };
  }

  // 3. Choix du pseudo final affiché sur le site.
  const displayName =
    member.nick?.trim() ||
    member.user.global_name?.trim() ||
    member.user.username?.trim() ||
    null;

  if (!displayName) {
    return { ok: false, profileId, reason: "aucun nom Discord récupéré" };
  }

  // 4. Avatar : serveur > global > rien.
  let avatarUrl: string | null = null;
  if (member.avatar) {
    avatarUrl = `https://cdn.discordapp.com/guilds/${env.guildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=128`;
  } else if (member.user.avatar) {
    avatarUrl = `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`;
  }

  // 5. Update Supabase.
  const flags = deriveRoleFlags(member.roles);
  const update: Record<string, unknown> = {
    username: displayName,
    discord_nick: member.nick ?? null,
    discord_global_name: member.user.global_name ?? member.user.username ?? null,
    discord_roles: member.roles,
    is_admin: flags.isAdmin,
    discord_synced_at: new Date().toISOString(),
  };
  if (avatarUrl) update.avatar_url = avatarUrl;

  const { error: updateErr } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", profileId);

  if (updateErr) {
    return { ok: false, profileId, reason: `supabase: ${updateErr.message}` };
  }

  return {
    ok: true,
    profileId,
    username: displayName,
    is_admin: flags.isAdmin,
  };
}

/**
 * Resync tous les profils qui ont un `discord_id`. Itère séquentiellement
 * pour respecter le rate limit Discord (~50 req/s par bot token, mais on
 * garde une marge avec un petit delay entre chaque appel).
 *
 * Retourne un résumé { synced, skipped, errors } pour la page admin.
 */
export type BulkResyncSummary = {
  total: number;
  synced: number;
  skipped: number;
  errors: { profileId: string; reason: string }[];
};

export async function resyncAllProfilesFromBot(): Promise<BulkResyncSummary> {
  const env = getEnv();
  if (!env.ok) {
    return {
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [{ profileId: "*", reason: env.reason }],
    };
  }

  const supabase = createServiceClient(env.url, env.serviceKey, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("profiles")
    .select("id")
    .not("discord_id", "is", null);

  if (error) {
    return {
      total: 0,
      synced: 0,
      skipped: 0,
      errors: [{ profileId: "*", reason: error.message }],
    };
  }

  const summary: BulkResyncSummary = {
    total: rows?.length ?? 0,
    synced: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows ?? []) {
    const result = await resyncProfileFromBot(row.id);
    if (result.ok) summary.synced++;
    else if (result.reason?.includes("404")) summary.skipped++;
    else summary.errors.push({ profileId: row.id, reason: result.reason ?? "?" });
    // Petit delay pour rester poli avec Discord (largement sous le rate
    // limit, mais pas la peine d'envoyer 50 req/s).
    await new Promise((r) => setTimeout(r, 50));
  }

  return summary;
}

import type * as Party from "partykit/server";
import type { Appearance } from "../../../shared/types";

export type ProfileRow = {
  gold: number;
  is_admin: boolean;
  username: string;
  avatar_url: string | null;
  tcg_free_packs?: Record<string, number> | null;
  appearance?: Appearance | null;
  // Liste brute des IDs de rôles Discord, synchronisée à chaque login web.
  // Sert à dériver les flags (admin, booster, …) côté serveur PartyKit
  // pour ne pas avoir à faire confiance à un flag client.
  discord_roles?: string[] | null;
};

export function getSupabaseEnv(room: Party.Room) {
  const env = (room as unknown as { env?: Record<string, string> }).env;
  const url = env?.SUPABASE_URL ?? readProcessEnv("SUPABASE_URL");
  const key =
    env?.SUPABASE_SERVICE_ROLE_KEY ??
    readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return { url, key };
}

export async function fetchProfile(
  room: Party.Room,
  authId: string,
): Promise<ProfileRow | null> {
  const env = getSupabaseEnv(room);
  if (!env) return null;
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/profiles?id=eq.${authId}&select=gold,is_admin,username,avatar_url,tcg_free_packs,appearance,discord_roles`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<
      Omit<ProfileRow, "gold"> & { gold: number | string }
    >;
    const row = rows[0];
    if (!row) return null;
    // PostgREST serializes bigint as a JSON string to preserve precision —
    // coerce here so callers always see a number.
    const gold = typeof row.gold === "string" ? Number(row.gold) : row.gold;
    if (!Number.isFinite(gold)) return null;
    return { ...row, gold };
  } catch {
    return null;
  }
}

export async function patchProfileGold(
  room: Party.Room,
  authId: string,
  gold: number,
) {
  const env = getSupabaseEnv(room);
  if (!env) {
    console.warn("[supabase] patchProfileGold: env missing");
    return;
  }
  try {
    const resp = await fetch(`${env.url}/rest/v1/profiles?id=eq.${authId}`, {
      method: "PATCH",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        gold,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "<no body>");
      console.warn(
        `[supabase] patchProfileGold failed ${resp.status} for ${authId}: ${body}`,
      );
    } else {
      console.log(
        `[supabase] patchProfileGold OK gold=${gold} for ${authId.slice(0, 8)}`,
      );
    }
  } catch (err) {
    console.warn("[supabase] patchProfileGold threw:", err);
  }
}

function readProcessEnv(key: string): string | undefined {
  const globalProc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return globalProc?.env?.[key];
}

export type TcgOwnedRow = { card_id: string; count: number };

/** Read the user's current TCG collection for a given game. */
export async function fetchTcgCollection(
  room: Party.Room,
  authId: string,
  gameId: string,
): Promise<TcgOwnedRow[]> {
  const env = getSupabaseEnv(room);
  if (!env) return [];
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/tcg_cards_owned?user_id=eq.${authId}&game_id=eq.${gameId}&select=card_id,count`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return [];
    const rows = (await resp.json()) as TcgOwnedRow[];
    return rows;
  } catch {
    return [];
  }
}

/** Atomically consume one free TCG pack for the user.
 *  Returns true when a free pack was decremented, false when there's none. */
export async function consumeTcgFreePack(
  room: Party.Room,
  authId: string,
  gameId: string,
): Promise<boolean> {
  const env = getSupabaseEnv(room);
  if (!env) return false;
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/rpc/consume_tcg_free_pack`,
      {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: authId, p_game_id: gameId }),
      },
    );
    if (!resp.ok) {
      console.warn(
        `[tcg] consume_tcg_free_pack failed ${resp.status}:`,
        await resp.text().catch(() => ""),
      );
      return false;
    }
    const data = (await resp.json()) as boolean | { result?: boolean };
    return typeof data === "boolean" ? data : !!data?.result;
  } catch (err) {
    console.warn("[tcg] consume_tcg_free_pack threw:", err);
    return false;
  }
}

// ─── TCG decks (supabase/tcg-decks.sql) ──────────────────────────────────

export type TcgDeckRow = {
  id: string;
  game_id: string;
  name: string;
  cards: { card_id: string; count: number }[] | null;
  updated_at: string;
};

/** Read every saved deck for a (user, game). */
export async function fetchTcgDecks(
  room: Party.Room,
  authId: string,
  gameId: string,
): Promise<TcgDeckRow[]> {
  const env = getSupabaseEnv(room);
  if (!env) return [];
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/tcg_decks?user_id=eq.${authId}&game_id=eq.${gameId}&select=id,game_id,name,cards,updated_at&order=updated_at.desc`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return [];
    return (await resp.json()) as TcgDeckRow[];
  } catch {
    return [];
  }
}

/** Read a single deck by id (any user, used by the battle server which
 *  only knows the deck id). Returns null if not found. */
export async function fetchTcgDeckById(
  room: Party.Room,
  deckId: string,
): Promise<TcgDeckRow | null> {
  const env = getSupabaseEnv(room);
  if (!env) return null;
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/tcg_decks?id=eq.${deckId}&select=id,game_id,name,cards,updated_at`,
      {
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return null;
    const rows = (await resp.json()) as TcgDeckRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Save (insert or update) a deck via the validating RPC. Returns the
 *  deck id on success, or an error message string on failure. */
export async function saveTcgDeck(
  room: Party.Room,
  authId: string,
  gameId: string,
  deckId: string | null,
  name: string,
  cards: { card_id: string; count: number }[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const env = getSupabaseEnv(room);
  if (!env) return { ok: false, error: "DB indisponible." };
  try {
    const resp = await fetch(`${env.url}/rest/v1/rpc/save_tcg_deck`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: authId,
        p_game_id: gameId,
        p_id: deckId,
        p_name: name,
        p_cards: cards,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      // PostgREST renvoie {"message":"..."} sur les exceptions levées
      // par PL/pgSQL — on remonte ce message au joueur.
      let parsed: { message?: string } | null = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        // pas du JSON, on garde body brut
      }
      const msg = parsed?.message ?? body ?? "Erreur de sauvegarde";
      return { ok: false, error: msg };
    }
    const data = await resp.json();
    const id = typeof data === "string" ? data : String(data);
    return { ok: true, id };
  } catch (err) {
    console.warn("[tcg] save_tcg_deck threw:", err);
    return { ok: false, error: "Erreur réseau." };
  }
}

/** Delete a deck (no-op if it doesn't belong to the user). */
export async function deleteTcgDeck(
  room: Party.Room,
  authId: string,
  deckId: string,
): Promise<boolean> {
  const env = getSupabaseEnv(room);
  if (!env) return false;
  try {
    const resp = await fetch(`${env.url}/rest/v1/rpc/delete_tcg_deck`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user_id: authId, p_id: deckId }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Record a finished PvP match (fun or ranked). For ranked, ELO of both
 *  players is updated atomically. Backed by record_battle_result in
 *  supabase/tcg-battles.sql. */
export async function recordBattleResult(
  room: Party.Room,
  args: {
    gameId: string;
    winnerId: string;
    loserId: string;
    winnerUsername: string;
    loserUsername: string;
    winnerDeckName: string | null;
    loserDeckName: string | null;
    ranked: boolean;
    reason: string;
  },
): Promise<{
  winner_elo_before: number;
  winner_elo_after: number;
  loser_elo_before: number;
  loser_elo_after: number;
} | null> {
  const env = getSupabaseEnv(room);
  if (!env) return null;
  try {
    const resp = await fetch(`${env.url}/rest/v1/rpc/record_battle_result`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_game_id: args.gameId,
        p_winner_id: args.winnerId,
        p_loser_id: args.loserId,
        p_winner_username: args.winnerUsername,
        p_loser_username: args.loserUsername,
        p_winner_deck_name: args.winnerDeckName,
        p_loser_deck_name: args.loserDeckName,
        p_ranked: args.ranked,
        p_reason: args.reason,
      }),
    });
    if (!resp.ok) {
      console.warn(
        `[battle] record_battle_result failed ${resp.status}:`,
        await resp.text().catch(() => ""),
      );
      return null;
    }
    return (await resp.json()) as {
      winner_elo_before: number;
      winner_elo_after: number;
      loser_elo_before: number;
      loser_elo_after: number;
    };
  } catch (err) {
    console.warn("[battle] record_battle_result threw:", err);
    return null;
  }
}

/** Read a player's TCG stats for a given game (ELO, winrate, totals). */
export type TcgPlayerStats = {
  elo: number;
  total: number;
  wins: number;
  losses: number;
  ranked_total: number;
  ranked_wins: number;
};

export async function fetchTcgPlayerStats(
  room: Party.Room,
  authId: string,
  gameId: string,
): Promise<TcgPlayerStats | null> {
  const env = getSupabaseEnv(room);
  if (!env) return null;
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/rpc/get_tcg_player_stats`,
      {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: authId, p_game_id: gameId }),
      },
    );
    if (!resp.ok) return null;
    return (await resp.json()) as TcgPlayerStats;
  } catch {
    return null;
  }
}

/** Record a bot-win for the daily quest. Returns {bot_wins, granted} where
 *  granted=true when the player just hit 3 wins and a free pack was added.
 *  Backed by record_tcg_bot_win in supabase/tcg.sql. */
export async function recordBotWin(
  room: Party.Room,
  authId: string,
  gameId: string,
): Promise<{ bot_wins: number; granted: boolean } | null> {
  const env = getSupabaseEnv(room);
  if (!env) return null;
  try {
    const resp = await fetch(`${env.url}/rest/v1/rpc/record_tcg_bot_win`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user_id: authId, p_game_id: gameId }),
    });
    if (!resp.ok) {
      console.warn(
        `[tcg] record_tcg_bot_win failed ${resp.status}:`,
        await resp.text().catch(() => ""),
      );
      return null;
    }
    const data = (await resp.json()) as {
      bot_wins?: number;
      granted?: boolean;
    };
    return {
      bot_wins: data?.bot_wins ?? 0,
      granted: !!data?.granted,
    };
  } catch (err) {
    console.warn("[tcg] record_tcg_bot_win threw:", err);
    return null;
  }
}

/** Atomically increment counts for a batch of cards via the RPC defined
 *  in supabase/tcg.sql. */
export async function addTcgCards(
  room: Party.Room,
  authId: string,
  gameId: string,
  cards: { card_id: string; count: number }[],
) {
  const env = getSupabaseEnv(room);
  if (!env) {
    console.warn("[tcg] addTcgCards: env missing");
    return;
  }
  if (cards.length === 0) return;
  try {
    const resp = await fetch(
      `${env.url}/rest/v1/rpc/add_cards_to_tcg_collection`,
      {
        method: "POST",
        headers: {
          apikey: env.key,
          Authorization: `Bearer ${env.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: authId,
          p_game_id: gameId,
          p_cards: cards,
        }),
      },
    );
    if (!resp.ok) {
      console.warn(
        `[tcg] addTcgCards failed ${resp.status}:`,
        await resp.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.warn("[tcg] addTcgCards threw:", err);
  }
}

import type * as Party from "partykit/server";

export type ProfileRow = {
  gold: number;
  is_admin: boolean;
  username: string;
  avatar_url: string | null;
  tcg_free_packs?: Record<string, number> | null;
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
      `${env.url}/rest/v1/profiles?id=eq.${authId}&select=gold,is_admin,username,avatar_url,tcg_free_packs`,
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

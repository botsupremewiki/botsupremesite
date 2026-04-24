import type * as Party from "partykit/server";

export type ProfileRow = {
  gold: number;
  is_admin: boolean;
  username: string;
  avatar_url: string | null;
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
      `${env.url}/rest/v1/profiles?id=eq.${authId}&select=gold,is_admin,username,avatar_url`,
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

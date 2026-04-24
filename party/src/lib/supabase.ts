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
    const rows = (await resp.json()) as ProfileRow[];
    return rows[0] ?? null;
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
  if (!env) return;
  try {
    await fetch(`${env.url}/rest/v1/profiles?id=eq.${authId}`, {
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
  } catch {
    // swallow; chat/game should still flow if the write fails
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

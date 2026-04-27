import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  SkylineProfileRow,
  SkylineCompanyRow,
  SkylineFurnitureRow,
  SkylineInventoryRow,
  SkylineTransactionRow,
  SkylineOffshoreLogRow,
} from "@shared/skyline";

export async function ensureSkylineProfile(): Promise<SkylineProfileRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  // Upsert via RPC (idempotent).
  await supabase.rpc("skyline_init_profile");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("skyline_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as SkylineProfileRow | null) ?? null;
}

export async function fetchSkylineCompanies(
  userId: string,
): Promise<SkylineCompanyRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_companies")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []) as SkylineCompanyRow[];
}

export async function fetchSkylineCompany(
  companyId: string,
): Promise<SkylineCompanyRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  // Tick lazy avant lecture (loyer prorata, etc.).
  await supabase.rpc("skyline_tick_company", { p_company_id: companyId });
  // Process sales (P1 — vente automatique aux PNJ).
  await supabase.rpc("skyline_process_sales", { p_company_id: companyId });
  const { data } = await supabase
    .from("skyline_companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle();
  return (data as SkylineCompanyRow | null) ?? null;
}

export async function fetchSkylineFurniture(
  companyId: string,
): Promise<SkylineFurnitureRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_furniture")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  return (data ?? []) as SkylineFurnitureRow[];
}

export async function fetchSkylineInventory(
  companyId: string,
): Promise<SkylineInventoryRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_inventory")
    .select("*")
    .eq("company_id", companyId)
    .order("product_id", { ascending: true });
  return (data ?? []) as SkylineInventoryRow[];
}

export async function fetchSkylineTransactions(
  userId: string,
  companyId: string | null = null,
  limit = 30,
): Promise<SkylineTransactionRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  let q = supabase
    .from("skyline_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (companyId) q = q.eq("company_id", companyId);
  const { data } = await q;
  return (data ?? []) as SkylineTransactionRow[];
}

export async function fetchSkylineOffshoreLog(
  userId: string,
  limit = 20,
): Promise<SkylineOffshoreLogRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_offshore_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SkylineOffshoreLogRow[];
}

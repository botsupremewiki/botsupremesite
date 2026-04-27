import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  SkylineProfileRow,
  SkylineCompanyRow,
  SkylineFurnitureRow,
  SkylineInventoryRow,
  SkylineTransactionRow,
  SkylineOffshoreLogRow,
  SkylineEmployeeRow,
  SkylineLoanRow,
  SkylinePermitRow,
  SkylineMachineRow,
  SkylineMarketCourseRow,
  SkylineNewsRow,
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
  // Tick lazy enrichi (loyer + salaires + saleté + mensualités + production/ventes).
  await supabase.rpc("skyline_tick_company_full", { p_company_id: companyId });
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

// ───── P2 : Employés ─────

export async function fetchEmployeesForCompany(
  companyId: string,
): Promise<SkylineEmployeeRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_employees")
    .select("*")
    .eq("company_id", companyId)
    .order("hired_at", { ascending: true });
  return (data ?? []) as SkylineEmployeeRow[];
}

export async function fetchEmployeeMarket(
  limit = 60,
): Promise<SkylineEmployeeRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_employees")
    .select("*")
    .is("company_id", null)
    .order("salary_demanded", { ascending: true })
    .limit(limit);
  return (data ?? []) as SkylineEmployeeRow[];
}

// Si le marché est vide, on déclenche la seed automatique.
export async function ensureEmployeeMarket(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const { count } = await supabase
    .from("skyline_employees")
    .select("*", { count: "exact", head: true })
    .is("company_id", null);
  if ((count ?? 0) < 20) {
    await supabase.rpc("skyline_seed_employees", { p_count: 50 });
  }
}

// ───── P2 : Permis ─────

export async function fetchPermitsForCompany(
  companyId: string,
): Promise<SkylinePermitRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_permits")
    .select("*")
    .eq("company_id", companyId)
    .order("acquired_at", { ascending: false });
  return (data ?? []) as SkylinePermitRow[];
}

// ───── P4 : Prêts ─────

export async function fetchLoansForUser(
  userId: string,
): Promise<SkylineLoanRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_loans")
    .select("*")
    .eq("user_id", userId)
    .is("paid_off_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as SkylineLoanRow[];
}

export async function checkBankruptcy(): Promise<boolean> {
  const supabase = await createClient();
  if (!supabase) return false;
  const { data } = await supabase.rpc("skyline_check_bankruptcy");
  return Boolean(data);
}

// ───── P5 : Usines / Machines ─────

export async function fetchMachinesForCompany(
  companyId: string,
): Promise<SkylineMachineRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_machines")
    .select("*")
    .eq("company_id", companyId)
    .order("installed_at", { ascending: true });
  return (data ?? []) as SkylineMachineRow[];
}

// ───── P6 : Marché commun + fil d'actu ─────

export async function ensureMarketSeeded(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("skyline_market_heartbeat");
}

export async function fetchMarketCourses(): Promise<SkylineMarketCourseRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_market_courses")
    .select("*")
    .order("product_id", { ascending: true });
  return (data ?? []) as SkylineMarketCourseRow[];
}

export async function fetchSkylineNews(limit = 20): Promise<SkylineNewsRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_news")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SkylineNewsRow[];
}

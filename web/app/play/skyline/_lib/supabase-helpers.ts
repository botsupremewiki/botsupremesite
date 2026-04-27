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
  SkylinePharmaPatentRow,
  SkylinePharmaResearchRow,
  SkylineSaasProductRow,
  SkylineRestaurantStarsRow,
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

// ───── P7 : Bourse ─────

export type SkylineCompanyShareWithName = {
  id: string;
  company_id: string;
  total_shares: number;
  ipo_price: number;
  current_price: number;
  market_cap: number;
  ipo_at: string | null;
  is_listed: boolean;
  company_name: string;
  company_sector: string;
  company_user_id: string;
};

export async function fetchListedCompanies(): Promise<
  SkylineCompanyShareWithName[]
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_company_shares")
    .select(
      "*, skyline_companies!inner(name, sector, user_id)",
    )
    .eq("is_listed", true)
    .order("market_cap", { ascending: false });
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => {
    const company = row.skyline_companies as {
      name: string;
      sector: string;
      user_id: string;
    };
    return {
      id: row.id as string,
      company_id: row.company_id as string,
      total_shares: Number(row.total_shares),
      ipo_price: Number(row.ipo_price),
      current_price: Number(row.current_price),
      market_cap: Number(row.market_cap),
      ipo_at: (row.ipo_at as string) ?? null,
      is_listed: row.is_listed as boolean,
      company_name: company.name,
      company_sector: company.sector,
      company_user_id: company.user_id,
    };
  });
}

export async function fetchShareForCompany(
  companyId: string,
): Promise<{
  id: string;
  total_shares: number;
  ipo_price: number;
  current_price: number;
  market_cap: number;
  is_listed: boolean;
  ipo_at: string | null;
} | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("skyline_company_shares")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    total_shares: Number(r.total_shares),
    ipo_price: Number(r.ipo_price),
    current_price: Number(r.current_price),
    market_cap: Number(r.market_cap),
    is_listed: r.is_listed as boolean,
    ipo_at: (r.ipo_at as string) ?? null,
  };
}

export async function fetchShareHoldingsForUser(
  userId: string,
): Promise<
  Array<{
    user_id: string;
    company_id: string;
    shares: number;
    avg_buy_price: number;
    company_name?: string;
    current_price?: number;
  }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_share_holdings")
    .select(
      "user_id, company_id, shares, avg_buy_price, skyline_companies!inner(name), skyline_company_shares!inner(current_price)",
    )
    .eq("user_id", userId);
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    user_id: r.user_id as string,
    company_id: r.company_id as string,
    shares: Number(r.shares),
    avg_buy_price: Number(r.avg_buy_price),
    company_name: (r.skyline_companies as { name: string }).name,
    current_price: Number(
      (r.skyline_company_shares as { current_price: number }).current_price,
    ),
  }));
}

export async function tickShareCourses(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("skyline_tick_shares");
}

// ───── P10 : Pharma R&D ─────

export async function fetchPharmaResearch(
  companyId: string,
): Promise<SkylinePharmaResearchRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_research")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  return (data ?? []) as SkylinePharmaResearchRow[];
}

export async function fetchPharmaPatents(
  companyId: string,
): Promise<SkylinePharmaPatentRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_patents")
    .select("*")
    .eq("company_id", companyId)
    .order("registered_at", { ascending: false });
  return (data ?? []) as SkylinePharmaPatentRow[];
}

// ───── P10 : SaaS ─────

export async function fetchSaasProducts(
  companyId: string,
): Promise<SkylineSaasProductRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  // Tick lazy SaaS avant lecture (revenus + croissance utilisateurs).
  await supabase.rpc("skyline_saas_tick", { p_company_id: companyId });
  const { data } = await supabase
    .from("skyline_saas_products")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("launched_at", { ascending: true });
  return (data ?? []) as SkylineSaasProductRow[];
}

// ───── P10 : Restau étoiles ─────

export async function fetchRestaurantStars(
  companyId: string,
): Promise<SkylineRestaurantStarsRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  // Évalue à chaque visite.
  await supabase.rpc("skyline_restau_evaluate", { p_company_id: companyId });
  const { data } = await supabase
    .from("skyline_restaurant_stars")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as SkylineRestaurantStarsRow | null) ?? null;
}

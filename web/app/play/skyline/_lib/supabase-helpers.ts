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
  SkylineHoldingRow,
  SkylineCompanyForSaleRow,
  SkylineAchievementId,
  SkylineLeaderboardRow,
  SkylineShortPositionRow,
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

// ───── P11 : Holdings + Vente d'entreprises ─────

export async function fetchHoldingsForUser(
  userId: string,
): Promise<SkylineHoldingRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_holdings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []) as SkylineHoldingRow[];
}

export async function fetchHoldingCompanies(
  holdingId: string,
): Promise<string[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_company_holdings_link")
    .select("company_id")
    .eq("holding_id", holdingId);
  return (data ?? []).map((r) => (r as { company_id: string }).company_id);
}

export type CompanyForSaleListing = {
  company_id: string;
  asking_price: number;
  listed_at: string;
  company_name: string;
  company_sector: string;
  company_category: string;
  company_district: string;
  monthly_revenue: number;
  seller_user_id: string;
};

export async function fetchCompaniesForSale(): Promise<CompanyForSaleListing[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_companies_for_sale")
    .select(
      "company_id, asking_price, listed_at, skyline_companies!inner(name, sector, category, district, monthly_revenue, user_id)",
    )
    .order("listed_at", { ascending: false });
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => {
    const c = row.skyline_companies as {
      name: string;
      sector: string;
      category: string;
      district: string;
      monthly_revenue: number;
      user_id: string;
    };
    return {
      company_id: row.company_id as string,
      asking_price: Number(row.asking_price),
      listed_at: row.listed_at as string,
      company_name: c.name,
      company_sector: c.sector,
      company_category: c.category,
      company_district: c.district,
      monthly_revenue: Number(c.monthly_revenue),
      seller_user_id: c.user_id,
    };
  });
}

export async function fetchListingForCompany(
  companyId: string,
): Promise<SkylineCompanyForSaleRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("skyline_companies_for_sale")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as SkylineCompanyForSaleRow | null) ?? null;
}

// ───── P12 : Classements + Achievements ─────

export type LeaderboardEntry = SkylineLeaderboardRow & {
  username: string;
  avatar_url: string | null;
};

export async function fetchLeaderboard(
  sort: "net_worth" | "monthly_profit" | "market_cap_total" = "net_worth",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  // Refresh global (à utiliser avec parcimonie).
  const { data } = await supabase
    .from("skyline_leaderboard")
    .select("*, profiles!inner(username, avatar_url)")
    .order(sort, { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((row) => {
    const p = row.profiles as { username: string; avatar_url: string | null };
    return {
      user_id: row.user_id as string,
      net_worth: Number(row.net_worth),
      monthly_profit: Number(row.monthly_profit),
      companies_count: Number(row.companies_count),
      market_cap_total: Number(row.market_cap_total),
      updated_at: row.updated_at as string,
      username: p.username,
      avatar_url: p.avatar_url,
    };
  });
}

export async function refreshOwnLeaderboard(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("skyline_update_leaderboard");
}

export async function fetchAchievementsForUser(
  userId: string,
): Promise<SkylineAchievementId[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_achievements")
    .select("achievement_id")
    .eq("user_id", userId);
  return (data ?? []).map(
    (r) => (r as { achievement_id: string }).achievement_id as SkylineAchievementId,
  );
}

export async function checkAchievements(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("skyline_check_achievements");
}

// ───── Session 1 : Audit aléatoire + ordres limit + short ─────

export async function runRandomAudit(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc("skyline_run_random_audit");
}

export async function fetchOpenShareOrders(
  userId: string,
): Promise<
  Array<{
    id: string;
    user_id: string;
    company_id: string;
    side: "buy" | "sell";
    order_kind: "market" | "limit";
    quantity: number;
    limit_price: number | null;
    status: string;
    created_at: string;
    company_name?: string;
  }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_share_orders")
    .select("*, skyline_companies!inner(name)")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => {
    const c = r.skyline_companies as { name: string };
    return {
      id: r.id as string,
      user_id: r.user_id as string,
      company_id: r.company_id as string,
      side: r.side as "buy" | "sell",
      order_kind: r.order_kind as "market" | "limit",
      quantity: Number(r.quantity),
      limit_price: r.limit_price ? Number(r.limit_price) : null,
      status: r.status as string,
      created_at: r.created_at as string,
      company_name: c.name,
    };
  });
}

export async function fetchOpenShortsForUser(
  userId: string,
): Promise<
  Array<SkylineShortPositionRow & { company_name?: string; current_price?: number }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_short_positions")
    .select(
      "*, skyline_companies!inner(name), skyline_company_shares!inner(current_price)",
    )
    .eq("user_id", userId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false });
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    company_id: r.company_id as string,
    shares_borrowed: Number(r.shares_borrowed),
    sold_price: Number(r.sold_price),
    proceeds: Number(r.proceeds),
    collateral: Number(r.collateral),
    opened_at: r.opened_at as string,
    closed_at: (r.closed_at as string) ?? null,
    close_price: r.close_price ? Number(r.close_price) : null,
    pnl: r.pnl ? Number(r.pnl) : null,
    company_name: (r.skyline_companies as { name: string }).name,
    current_price: Number(
      (r.skyline_company_shares as { current_price: number }).current_price,
    ),
  }));
}

// ───── Session 1 : Salariat joueur ─────

export async function fetchPlayerCandidates(
  limit = 30,
): Promise<
  Array<{
    employee_id: string;
    user_id: string;
    full_name: string;
    skills: Record<string, number>;
    salary_demanded: number;
  }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("skyline_employees")
    .select("id, user_id, full_name, skills, salary_demanded")
    .is("company_id", null)
    .eq("is_npc", false)
    .order("salary_demanded", { ascending: true })
    .limit(limit);
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    employee_id: r.id as string,
    user_id: r.user_id as string,
    full_name: r.full_name as string,
    skills: (r.skills ?? {}) as Record<string, number>,
    salary_demanded: Number(r.salary_demanded),
  }));
}

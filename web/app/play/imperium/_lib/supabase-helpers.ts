import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ImperiumVillageRow,
  ImperiumBuildingRow,
  ImperiumQueueRow,
  ImperiumUnitRow,
  ImperiumResearchRow,
  ImperiumForgeRow,
  ImperiumMarchRow,
  ImperiumReportRow,
  ImperiumMapCellRow,
  ImperiumAllianceRow,
  ImperiumAllianceMemberRow,
} from "@shared/imperium";

export async function fetchImperiumVillages(
  userId: string,
): Promise<ImperiumVillageRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_villages")
    .select("*")
    .eq("user_id", userId)
    .order("is_secondary", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as ImperiumVillageRow[];
}

export async function fetchImperiumVillage(
  villageId: string,
): Promise<ImperiumVillageRow | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  // Tick lazy avant lecture
  await supabase.rpc("imperium_tick", { p_village_id: villageId });
  const { data } = await supabase
    .from("imperium_villages")
    .select("*")
    .eq("id", villageId)
    .maybeSingle();
  return (data as ImperiumVillageRow | null) ?? null;
}

export async function fetchImperiumBuildings(
  villageId: string,
): Promise<ImperiumBuildingRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_buildings")
    .select("*")
    .eq("village_id", villageId)
    .order("slot", { ascending: true });
  return (data ?? []) as ImperiumBuildingRow[];
}

export async function fetchImperiumQueue(
  villageId: string,
): Promise<ImperiumQueueRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_construction_queue")
    .select("*")
    .eq("village_id", villageId)
    .order("finishes_at", { ascending: true });
  return (data ?? []) as ImperiumQueueRow[];
}

export async function fetchImperiumUnits(
  villageId: string,
): Promise<ImperiumUnitRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_units")
    .select("*")
    .eq("village_id", villageId);
  return (data ?? []) as ImperiumUnitRow[];
}

export async function fetchImperiumResearch(
  villageId: string,
): Promise<ImperiumResearchRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_research")
    .select("*")
    .eq("village_id", villageId);
  return (data ?? []) as ImperiumResearchRow[];
}

export async function fetchImperiumForge(
  villageId: string,
): Promise<ImperiumForgeRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_forge")
    .select("*")
    .eq("village_id", villageId);
  return (data ?? []) as ImperiumForgeRow[];
}

export async function fetchImperiumMarches(
  villageId: string,
): Promise<ImperiumMarchRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_marches")
    .select("*")
    .eq("from_village_id", villageId)
    .in("state", ["outbound", "returning"])
    .order("arrives_at", { ascending: true });
  return (data ?? []) as ImperiumMarchRow[];
}

export async function fetchImperiumReports(
  userId: string,
  limit = 20,
): Promise<ImperiumReportRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_reports")
    .select("*")
    .or(`attacker_user_id.eq.${userId},defender_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ImperiumReportRow[];
}

export async function fetchImperiumMapArea(
  centerX: number,
  centerY: number,
  radius = 8,
): Promise<ImperiumMapCellRow[]> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("imperium_map")
    .select("*")
    .gte("x", centerX - radius)
    .lte("x", centerX + radius)
    .gte("y", centerY - radius)
    .lte("y", centerY + radius);
  return (data ?? []) as ImperiumMapCellRow[];
}

export async function fetchImperiumAlliance(
  userId: string,
): Promise<{
  alliance: ImperiumAllianceRow;
  members: ImperiumAllianceMemberRow[];
} | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: member } = await supabase
    .from("imperium_alliance_members")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return null;
  const { data: alliance } = await supabase
    .from("imperium_alliances")
    .select("*")
    .eq("id", member.alliance_id)
    .maybeSingle();
  if (!alliance) return null;
  const { data: members } = await supabase
    .from("imperium_alliance_members")
    .select("*")
    .eq("alliance_id", member.alliance_id);
  return {
    alliance: alliance as ImperiumAllianceRow,
    members: (members ?? []) as ImperiumAllianceMemberRow[],
  };
}

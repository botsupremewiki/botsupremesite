"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createCompanyAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/play/skyline?err=auth");
  }

  const sector = String(formData.get("sector") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const district = String(formData.get("district") ?? "").trim();
  const localSize = String(formData.get("local_size") ?? "").trim();
  const purchase = formData.get("purchase") === "on";
  const category = String(formData.get("category") ?? "commerce").trim();

  if (!sector || !name || !district || !localSize) {
    redirect("/play/skyline/creation?err=missing");
  }

  const { data, error } = await supabase.rpc("skyline_create_company", {
    p_category: category,
    p_sector: sector,
    p_name: name,
    p_district: district,
    p_local_size: localSize,
    p_purchase: purchase,
  });

  if (error) {
    redirect(
      `/play/skyline/creation?err=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/play/skyline");
  redirect(`/play/skyline/${data}`);
}

export async function purchaseStockAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const companyId = String(formData.get("company_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);

  if (!companyId || !productId || quantity <= 0) {
    return { ok: false, error: "Paramètres invalides" };
  }

  const { error } = await supabase.rpc("skyline_purchase_stock", {
    p_company_id: companyId,
    p_product_id: productId,
    p_quantity: quantity,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function setSellPriceAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const companyId = String(formData.get("company_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const price = Number(formData.get("price") ?? 0);

  if (!companyId || !productId || price < 0) {
    return { ok: false, error: "Paramètres invalides" };
  }

  const { error } = await supabase.rpc("skyline_set_sell_price", {
    p_company_id: companyId,
    p_product_id: productId,
    p_price: price,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function buyFurnitureAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");

  if (!companyId || !kind) {
    return { ok: false, error: "Paramètres invalides" };
  }

  const { error } = await supabase.rpc("skyline_buy_furniture", {
    p_company_id: companyId,
    p_kind: kind,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function pontWireAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const dollars = Number(formData.get("dollars") ?? 0);
  if (dollars <= 0) return { ok: false, error: "Montant invalide" };

  const { data, error } = await supabase.rpc("skyline_pont_wire", {
    p_dollars: dollars,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/play/skyline/offshore");
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function pontShellAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const dollars = Number(formData.get("dollars") ?? 0);
  if (dollars <= 0) return { ok: false, error: "Montant invalide" };

  const { data, error } = await supabase.rpc("skyline_pont_shell", {
    p_dollars: dollars,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/play/skyline/offshore");
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function pontInverseAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };

  const os = Number(formData.get("os") ?? 0);
  if (os <= 0) return { ok: false, error: "Montant invalide" };

  const { data, error } = await supabase.rpc("skyline_pont_inverse", {
    p_os: os,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/play/skyline/offshore");
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

// ───── P2 : Employés ─────

export async function hireEmployeeAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const employeeId = String(formData.get("employee_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  const salary = formData.get("salary") ? Number(formData.get("salary")) : null;
  if (!employeeId || !companyId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_hire_employee", {
    p_employee_id: employeeId,
    p_company_id: companyId,
    p_salary: salary,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline/emploi");
  return { ok: true, data: null };
}

export async function fireEmployeeAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const employeeId = String(formData.get("employee_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!employeeId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_fire_employee", {
    p_employee_id: employeeId,
  });

  if (error) return { ok: false, error: error.message };
  if (companyId) revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline/emploi");
  return { ok: true, data: null };
}

export async function cleanCompanyAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_clean_company", {
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function acquirePermitAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_acquire_permit", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── P3 : Placement présentoirs ─────

export async function placeFurnitureAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const furnitureId = String(formData.get("furniture_id") ?? "");
  const x = Number(formData.get("grid_x") ?? 0);
  const y = Number(formData.get("grid_y") ?? 0);
  const rotation = Number(formData.get("rotation") ?? 0);
  const companyId = String(formData.get("company_id") ?? "");

  if (!furnitureId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_place_furniture", {
    p_furniture_id: furnitureId,
    p_grid_x: x,
    p_grid_y: y,
    p_rotation: rotation,
  });
  if (error) return { ok: false, error: error.message };
  if (companyId) revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function removeFurnitureAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const furnitureId = String(formData.get("furniture_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!furnitureId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_remove_furniture", {
    p_furniture_id: furnitureId,
  });
  if (error) return { ok: false, error: error.message };
  if (companyId) revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── P4 : Banque ─────

export async function requestLoanAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const amount = Number(formData.get("amount") ?? 0);
  const durationMonths = Number(formData.get("duration_months") ?? 0);
  const companyId = formData.get("company_id")
    ? String(formData.get("company_id"))
    : null;
  const isStarter = formData.get("is_starter") === "on";

  if (amount <= 0 || durationMonths <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_request_loan", {
    p_amount: amount,
    p_duration_months: durationMonths,
    p_company_id: companyId,
    p_is_starter: isStarter,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/banque");
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function repayLoanAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const loanId = String(formData.get("loan_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!loanId || amount <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_repay_loan", {
    p_loan_id: loanId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/banque");
  revalidatePath("/play/skyline");
  return { ok: true, data: null };
}

// ───── P5 : Usines / Machines ─────

export async function buyMachineAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const level = String(formData.get("level") ?? "");
  if (!companyId || !kind || !level)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_buy_machine", {
    p_company_id: companyId,
    p_kind: kind,
    p_level: level,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function purchaseRawMaterialAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const materialId = String(formData.get("material_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!companyId || !materialId || quantity <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_purchase_raw_material", {
    p_company_id: companyId,
    p_material_id: materialId,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── P6 : Marché commun ─────

export async function placeMarketOrderAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!companyId || !side || !productId || quantity <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_place_market_order", {
    p_company_id: companyId,
    p_side: side,
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/marche");
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

// ───── P7 : Bourse ─────

export async function ipoCompanyAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const totalShares = Number(formData.get("total_shares") ?? 0);
  const keepPct = Number(formData.get("keep_pct") ?? 60);
  if (!companyId || totalShares <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_ipo_company", {
    p_company_id: companyId,
    p_total_shares: totalShares,
    p_keep_pct: keepPct,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function placeShareOrderAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!companyId || !side || quantity <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_place_share_order", {
    p_company_id: companyId,
    p_side: side,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function payDividendAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!companyId || amount <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_pay_dividend", {
    p_company_id: companyId,
    p_total_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline/bourse");
  return { ok: true, data };
}

// ───── P8 : Matières premières ─────

export async function buyRawMachineAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const level = String(formData.get("level") ?? "");
  if (!companyId || !level)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_buy_raw_machine", {
    p_company_id: companyId,
    p_level: level,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── P9 : Services + Apprentissage joueur ─────

export async function buyServiceEquipmentAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const level = String(formData.get("level") ?? "");
  if (!companyId || !level)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_buy_service_equipment", {
    p_company_id: companyId,
    p_level: level,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function startPlayerTrainingAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const skill = String(formData.get("skill") ?? "");
  const targetLevel = Number(formData.get("target_level") ?? 50);
  if (!skill || targetLevel <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_start_player_training", {
    p_skill: skill,
    p_target_level: targetLevel,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

export async function finishPlayerTrainingAction(): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const { data, error } = await supabase.rpc(
    "skyline_finish_player_training",
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline");
  return { ok: true, data };
}

// ───── P10 : Pharma R&D ─────

export async function pharmaStartResearchAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const molecule = String(formData.get("molecule") ?? "");
  if (!companyId || !molecule)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_pharma_start_research", {
    p_company_id: companyId,
    p_molecule: molecule,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function pharmaCompleteResearchAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const researchId = String(formData.get("research_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!researchId) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc(
    "skyline_pharma_complete_research",
    { p_research_id: researchId },
  );
  if (error) return { ok: false, error: error.message };
  if (companyId) revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function pharmaSellAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const molecule = String(formData.get("molecule") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!companyId || !molecule || quantity <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_pharma_sell", {
    p_company_id: companyId,
    p_molecule: molecule,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

// ───── P10 : SaaS ─────

export async function saasLaunchAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const productName = String(formData.get("product_name") ?? "");
  const monthlyPrice = Number(formData.get("monthly_price") ?? 9.99);
  if (!companyId || !productName)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_saas_launch", {
    p_company_id: companyId,
    p_product_name: productName,
    p_monthly_price: monthlyPrice,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

// ───── P11 : Holdings ─────

export async function createHoldingAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Nom invalide" };

  const { data, error } = await supabase.rpc("skyline_create_holding", {
    p_name: name,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/holdings");
  return { ok: true, data };
}

export async function linkCompanyToHoldingAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const holdingId = String(formData.get("holding_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!holdingId || !companyId)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_link_company_to_holding", {
    p_holding_id: holdingId,
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/holdings");
  return { ok: true, data: null };
}

export async function unlinkCompanyFromHoldingAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const holdingId = String(formData.get("holding_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!holdingId || !companyId)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_unlink_company_from_holding", {
    p_holding_id: holdingId,
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/holdings");
  return { ok: true, data: null };
}

export async function holdingTransferCashAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const holdingId = String(formData.get("holding_id") ?? "");
  const fromCompany = String(formData.get("from_company") ?? "");
  const toCompany = String(formData.get("to_company") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!holdingId || !fromCompany || !toCompany || amount <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_holding_transfer_cash", {
    p_holding_id: holdingId,
    p_from_company: fromCompany,
    p_to_company: toCompany,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/holdings");
  return { ok: true, data: null };
}

// ───── P11 : Vente d'entreprises ─────

export async function listCompanyForSaleAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const askingPrice = Number(formData.get("asking_price") ?? 0);
  if (!companyId || askingPrice <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_list_company_for_sale", {
    p_company_id: companyId,
    p_asking_price: askingPrice,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline/marche-entreprises");
  return { ok: true, data: null };
}

export async function unlistCompanyAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_unlist_company", {
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  revalidatePath("/play/skyline/marche-entreprises");
  return { ok: true, data: null };
}

export async function buyCompanyAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_buy_company", {
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/marche-entreprises");
  revalidatePath("/play/skyline");
  return { ok: true, data: null };
}

// ───── Session 1 : Salariat joueur ─────

export async function offerSelfToMarketAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const minSalary = Number(formData.get("min_salary") ?? 2000);
  if (minSalary <= 0) return { ok: false, error: "Salaire invalide" };

  const { error } = await supabase.rpc("skyline_offer_self_to_market", {
    p_min_salary: minSalary,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/job");
  revalidatePath("/play/skyline/emploi");
  return { ok: true, data: null };
}

export async function withdrawSelfFromMarketAction(): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const { error } = await supabase.rpc("skyline_withdraw_self_from_market");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/job");
  revalidatePath("/play/skyline/emploi");
  return { ok: true, data: null };
}

export async function playerQuitJobAction(): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const { error } = await supabase.rpc("skyline_player_quit_job");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/job");
  return { ok: true, data: null };
}

// ───── Session 1 : Bourse étendue ─────

export async function placeShareLimitOrderAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const side = String(formData.get("side") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const limitPrice = Number(formData.get("limit_price") ?? 0);
  if (!companyId || !side || quantity <= 0 || limitPrice <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_place_share_limit_order", {
    p_company_id: companyId,
    p_side: side,
    p_quantity: quantity,
    p_limit_price: limitPrice,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  return { ok: true, data };
}

export async function cancelShareOrderAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_cancel_share_order", {
    p_order_id: orderId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  return { ok: true, data: null };
}

export async function openShortPositionAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  if (!companyId || quantity <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_open_short_position", {
    p_company_id: companyId,
    p_quantity: quantity,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  return { ok: true, data };
}

export async function closeShortPositionAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const shortId = String(formData.get("short_id") ?? "");
  if (!shortId) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_close_short_position", {
    p_short_id: shortId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/bourse");
  return { ok: true, data };
}

// ───── Session 2 : BTP ─────

export async function btpStartProjectAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_btp_start_project", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function btpCompleteProjectAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const projectId = String(formData.get("project_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!projectId) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_btp_complete_project", {
    p_project_id: projectId,
  });
  if (error) return { ok: false, error: error.message };
  if (companyId) revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

// ───── Session 2 : Casino ─────

export async function casinoSetRtpAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const rtp = Number(formData.get("rtp") ?? 95);
  if (!companyId || rtp < 90 || rtp > 99)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_casino_set_rtp", {
    p_company_id: companyId,
    p_rtp: rtp,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function casinoAddVipAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_casino_add_vip", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── Session 2 : Aérien ─────

export async function openRouteAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_open_route", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function closeRouteAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_close_route", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

// ───── Session 2 : Banque prêts inter-joueurs ─────

export async function offerLoanAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const lenderCompanyId = String(formData.get("lender_company_id") ?? "");
  const borrowerUserId = String(formData.get("borrower_user_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const rate = Number(formData.get("rate") ?? 0);
  const durationMonths = Number(formData.get("duration_months") ?? 0);
  if (!lenderCompanyId || !borrowerUserId || amount <= 0 || rate <= 0)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_offer_loan", {
    p_lender_company_id: lenderCompanyId,
    p_borrower_user_id: borrowerUserId,
    p_amount: amount,
    p_rate: rate,
    p_duration_months: durationMonths,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/banque-pro");
  revalidatePath("/play/skyline/banque");
  return { ok: true, data };
}

export async function acceptLoanOfferAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const loanId = String(formData.get("loan_id") ?? "");
  if (!loanId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_accept_loan_offer", {
    p_loan_id: loanId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/banque");
  return { ok: true, data: null };
}

export async function declineLoanOfferAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const loanId = String(formData.get("loan_id") ?? "");
  if (!loanId) return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_decline_loan_offer", {
    p_loan_id: loanId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/play/skyline/banque");
  return { ok: true, data: null };
}

// ───── Session 3 : Médias / Luxe / Armement ─────

export async function produceShowAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!companyId || !kind) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_produce_show", {
    p_company_id: companyId,
    p_kind: kind,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function createLuxuryBrandAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  const brandName = String(formData.get("brand_name") ?? "").trim();
  if (!companyId || !brandName)
    return { ok: false, error: "Paramètres invalides" };

  const { error } = await supabase.rpc("skyline_create_luxury_brand", {
    p_company_id: companyId,
    p_brand_name: brandName,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data: null };
}

export async function fashionShowAction(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const companyId = String(formData.get("company_id") ?? "");
  if (!companyId) return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc("skyline_fashion_show", {
    p_company_id: companyId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

export async function fulfillMilitaryContractAction(
  formData: FormData,
): Promise<Result> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Non connecté" };
  const contractId = String(formData.get("contract_id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!contractId || !companyId)
    return { ok: false, error: "Paramètres invalides" };

  const { data, error } = await supabase.rpc(
    "skyline_fulfill_military_contract",
    {
      p_contract_id: contractId,
      p_company_id: companyId,
    },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/play/skyline/${companyId}`);
  return { ok: true, data };
}

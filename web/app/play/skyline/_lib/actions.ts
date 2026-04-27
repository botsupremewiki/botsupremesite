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

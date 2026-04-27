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

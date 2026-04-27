"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  type EternumHero,
} from "@shared/types";
import {
  ETERNUM_ITEMS_BY_ID,
  ITEM_SLOTS,
  ITEM_SLOT_GLYPH,
  ITEM_SLOT_LABEL,
  type ItemSlot,
} from "@shared/eternum-items";
import { createClient } from "@/lib/supabase/client";
import type { OwnedItem } from "./page";

const RARITY_BORDER: Record<string, string> = {
  common: "border-zinc-500/40",
  rare: "border-emerald-400/50",
  epic: "border-sky-400/60",
  legendary: "border-amber-400/60",
  prismatic: "border-fuchsia-400/60",
};

export function EquipementClient({
  hero,
  initialItems,
}: {
  hero: EternumHero;
  initialItems: OwnedItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<OwnedItem[]>(initialItems);
  const [pickerSlot, setPickerSlot] = useState<ItemSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Index: hero-equipped items par slot
  const heroEquipped = useMemo(() => {
    const m = new Map<ItemSlot, OwnedItem>();
    for (const it of items) {
      if (!it.equipped_on_hero) continue;
      const tpl = ETERNUM_ITEMS_BY_ID.get(it.item_id);
      if (tpl) m.set(tpl.slot, it);
    }
    return m;
  }, [items]);

  // Items disponibles (non équipés ailleurs) pour le slot sélectionné
  const availableForSlot = useMemo(() => {
    if (!pickerSlot) return [];
    return items.filter((it) => {
      const tpl = ETERNUM_ITEMS_BY_ID.get(it.item_id);
      if (!tpl) return false;
      if (tpl.slot !== pickerSlot) return false;
      // Class restriction : si l'item a une classe spécifique, doit matcher.
      if (tpl.classes.length > 0 && !tpl.classes.includes(hero.classId)) return false;
      // Level requirement
      if (hero.level < tpl.levelRequired) return false;
      // Pas déjà équipé sur le héros sur ce slot
      if (it.equipped_on_hero) return false;
      // Pas équipé sur un familier
      if (it.equipped_on_familier !== null) return false;
      return true;
    });
  }, [pickerSlot, items, hero]);

  async function equipItem(itemOwnedId: string) {
    if (!supabase || !pickerSlot) return;
    setError(null);

    // 1) Désequipe l'item actuel sur ce slot s'il y en a un.
    const current = heroEquipped.get(pickerSlot);
    if (current) {
      await supabase.rpc("eternum_equip_item", {
        p_owned_item_id: current.id,
        p_target_type: "none",
        p_target_familier_id: null,
      });
    }

    // 2) Équipe le nouvel item.
    const { error: rpcErr } = await supabase.rpc("eternum_equip_item", {
      p_owned_item_id: itemOwnedId,
      p_target_type: "hero",
      p_target_familier_id: null,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemOwnedId) return { ...it, equipped_on_hero: true, equipped_on_familier: null };
        if (current && it.id === current.id) return { ...it, equipped_on_hero: false };
        return it;
      }),
    );
    setPickerSlot(null);
    router.refresh();
  }

  async function unequipSlot(slot: ItemSlot) {
    if (!supabase) return;
    const cur = heroEquipped.get(slot);
    if (!cur) return;
    await supabase.rpc("eternum_equip_item", {
      p_owned_item_id: cur.id,
      p_target_type: "none",
      p_target_familier_id: null,
    });
    setItems((prev) =>
      prev.map((it) =>
        it.id === cur.id ? { ...it, equipped_on_hero: false } : it,
      ),
    );
    router.refresh();
  }

  // Stats agrégées (somme des items équipés)
  const aggStats = useMemo(() => {
    let hp = 0,
      atk = 0,
      def = 0,
      spd = 0;
    for (const [, it] of heroEquipped) {
      const tpl = ETERNUM_ITEMS_BY_ID.get(it.item_id);
      if (!tpl) continue;
      hp += tpl.bonusStats.hp;
      atk += tpl.bonusStats.atk;
      def += tpl.bonusStats.def;
      spd += tpl.bonusStats.spd;
    }
    return { hp, atk, def, spd };
  }, [heroEquipped]);

  const cls = ETERNUM_CLASSES[hero.classId];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      {/* Stats agrégées */}
      <section className="shrink-0 rounded-xl border border-amber-400/30 bg-black/40 p-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-400">
          Bonus équipement (somme des items équipés)
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
          <Stat label="HP" value={`+${aggStats.hp}`} />
          <Stat label="ATK" value={`+${aggStats.atk}`} />
          <Stat label="DEF" value={`+${aggStats.def}`} />
          <Stat label="VIT" value={`+${aggStats.spd}`} />
        </div>
        <div className="mt-2 text-[10px] text-zinc-500">
          {cls.name} niveau {hero.level} — total équipé : {heroEquipped.size}/8 slots
        </div>
      </section>

      {error && (
        <div className="shrink-0 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Slots */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
        {ITEM_SLOTS.map((slot) => {
          const cur = heroEquipped.get(slot);
          const tpl = cur ? ETERNUM_ITEMS_BY_ID.get(cur.item_id) : null;
          return (
            <div
              key={slot}
              className={`flex flex-col gap-2 rounded-xl border p-3 ${
                tpl ? RARITY_BORDER[tpl.rarity] : "border-white/10 border-dashed"
              } bg-black/40`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{ITEM_SLOT_GLYPH[slot]}</span>
                <span className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {ITEM_SLOT_LABEL[slot]}
                </span>
              </div>
              {tpl ? (
                <>
                  <div className="text-xs font-semibold text-zinc-100">{tpl.name}</div>
                  <div className="text-[10px] text-zinc-400">
                    {tpl.rarity} · niv {tpl.levelRequired}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {tpl.bonusStats.hp > 0 && <span>HP +{tpl.bonusStats.hp}</span>}
                    {tpl.bonusStats.atk > 0 && <span>ATK +{tpl.bonusStats.atk}</span>}
                    {tpl.bonusStats.def > 0 && <span>DEF +{tpl.bonusStats.def}</span>}
                    {tpl.bonusStats.spd > 0 && <span>VIT +{tpl.bonusStats.spd}</span>}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPickerSlot(slot)}
                      className="flex-1 rounded bg-amber-500/20 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-500/30"
                    >
                      Changer
                    </button>
                    <button
                      onClick={() => unequipSlot(slot)}
                      className="rounded bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-500/30"
                    >
                      ✕
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setPickerSlot(slot)}
                  className="rounded bg-white/5 px-2 py-2 text-[10px] text-zinc-400 hover:bg-white/10"
                >
                  + Équiper
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Picker modal */}
      {pickerSlot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPickerSlot(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold">
                  Choisir un {ITEM_SLOT_LABEL[pickerSlot]}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {availableForSlot.length} item(s) disponible(s) · niveau requis ≤ {hero.level}
                </div>
              </div>
              <button onClick={() => setPickerSlot(null)} className="text-zinc-400 hover:text-zinc-100">
                ✕
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {availableForSlot.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-xs text-zinc-500">
                  Aucun item disponible. Va crafter dans /personnage/metiers ou
                  drop-en dans des donjons.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {availableForSlot.map((it) => {
                    const tpl = ETERNUM_ITEMS_BY_ID.get(it.item_id);
                    if (!tpl) return null;
                    return (
                      <button
                        key={it.id}
                        onClick={() => equipItem(it.id)}
                        className={`flex items-start justify-between gap-3 rounded-md border ${RARITY_BORDER[tpl.rarity]} bg-black/40 p-3 text-left hover:bg-white/[0.04]`}
                      >
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{tpl.name}</div>
                          <div className="text-[10px] text-zinc-400">
                            {tpl.rarity} · niv {tpl.levelRequired}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 text-[10px]">
                          {tpl.bonusStats.hp > 0 && <span>HP +{tpl.bonusStats.hp}</span>}
                          {tpl.bonusStats.atk > 0 && <span>ATK +{tpl.bonusStats.atk}</span>}
                          {tpl.bonusStats.def > 0 && <span>DEF +{tpl.bonusStats.def}</span>}
                          {tpl.bonusStats.spd > 0 && <span>VIT +{tpl.bonusStats.spd}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="font-semibold tabular-nums text-amber-200">{value}</div>
    </div>
  );
}

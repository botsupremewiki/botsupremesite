"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type MetaBadges = {
  /** Le joueur peut réclamer sa récompense quotidienne. */
  dailyClaimable: boolean;
  /** Nombre de demandes d'ami en attente. */
  friendPending: number;
};

const EMPTY: MetaBadges = { dailyClaimable: false, friendPending: 0 };
const POLL_MS = 60_000;

/**
 * Hook qui récupère l'état des badges « action requise » du menu profil
 * (récompense quotidienne dispo, demandes d'amis en attente). Poll toutes
 * les 60s tant que le composant est monté. Sans Supabase configuré ou
 * sans utilisateur connecté, retourne `{}` sans appeler.
 */
export function useMetaBadges(enabled: boolean = true): MetaBadges {
  const supabase = useMemo(() => createClient(), []);
  const [badges, setBadges] = useState<MetaBadges>(EMPTY);

  useEffect(() => {
    if (!supabase || !enabled) return;
    let cancelled = false;

    async function refresh() {
      if (!supabase) return;
      const [statusRes, pendingRes] = await Promise.all([
        supabase.rpc("daily_reward_status"),
        supabase.rpc("friend_pending_count"),
      ]);
      if (cancelled) return;
      const statusRow = Array.isArray(statusRes.data)
        ? statusRes.data[0]
        : statusRes.data;
      const pending = Array.isArray(pendingRes.data)
        ? pendingRes.data[0]
        : pendingRes.data;
      setBadges({
        dailyClaimable: !!statusRow?.can_claim,
        friendPending: typeof pending === "number" ? pending : 0,
      });
    }

    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [supabase, enabled]);

  return badges;
}

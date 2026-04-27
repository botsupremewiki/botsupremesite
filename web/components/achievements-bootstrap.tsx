"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackFirstLogin } from "@/lib/achievement-tracker";

/**
 * Composant invisible — déclenche les achievements "first-login" et autres
 * triggers passifs au montage. À placer dans une page racine de chaque jeu.
 */
export function AchievementsBootstrap() {
  const supabase = useMemo(() => createClient(), []);
  useEffect(() => {
    if (!supabase) return;
    // Idempotent côté serveur — re-call OK.
    trackFirstLogin(supabase).catch(() => {});
  }, [supabase]);
  return null;
}

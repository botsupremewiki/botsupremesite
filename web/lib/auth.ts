import "server-only";
import { cache } from "react";
import type { Appearance } from "@shared/types";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  username: string;
  avatar_url: string | null;
  gold: number;
  is_admin: boolean;
  appearance?: Appearance | null;
  // Synchronisé depuis Discord à chaque login. `username` reflète déjà la
  // priorité nick > global, ces colonnes sont conservées pour debug et
  // pour pouvoir afficher la source au besoin (ex: "AKA botsupreme").
  discord_id?: string | null;
  discord_nick?: string | null;
  discord_global_name?: string | null;
  // Liste des IDs de rôles Discord du joueur, dérivée à chaque login.
  // Utilisée par `hasRole(profile, "BOOSTER")` etc. — voir
  // web/lib/discord-roles.ts pour le mapping ID → fonctionnalité.
  discord_roles?: string[] | null;
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, gold, is_admin, appearance, discord_id, discord_nick, discord_global_name, discord_roles",
    )
    .eq("id", user.id)
    .single();

  return data;
});

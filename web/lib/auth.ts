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
    .select("id, username, avatar_url, gold, is_admin, appearance")
    .eq("id", user.id)
    .single();

  return data;
});

import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";
import { SocialClient } from "./social-client";

export const dynamic = "force-dynamic";

export type Guild = {
  id: string;
  name: string;
  tag: string;
  level: number;
  bank_gold: number;
};
export type GuildBoss = {
  guild_id: string;
  boss_tier: number;
  boss_hp_remaining: number;
  reset_at: string;
};
export type Friend = {
  friend_id: string;
  username: string;
  class_id: string | null;
  element_id: string | null;
  level: number | null;
};
export type FriendRequest = { requester_id: string; username: string };

export default async function SocialPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  let myGuild: Guild | null = null;
  let allGuilds: Guild[] = [];
  type Membership = { guild_id: string; role: string };
  let myMembership: Membership | null = null;
  let guildBoss: GuildBoss | null = null;
  let friends: Friend[] = [];
  let requests: FriendRequest[] = [];

  // Mes familiers (pour le picker de prêt aux amis).
  type FamilierForLend = {
    id: string;
    familier_id: string;
    element_id: string;
    level: number;
    star: number;
    team_slot: number | null;
  };
  let myFamiliers: FamilierForLend[] = [];

  if (supabase) {
    const famRes = await supabase
      .from("eternum_familiers_owned")
      .select("id,familier_id,element_id,level,star,team_slot")
      .eq("user_id", profile.id)
      .order("level", { ascending: false });
    myFamiliers = (famRes.data ?? []) as FamilierForLend[];

    const memRes = await supabase
      .from("eternum_guild_members")
      .select("guild_id,role")
      .eq("user_id", profile.id)
      .maybeSingle();
    myMembership = (memRes.data as Membership | null) ?? null;

    if (myMembership) {
      const [gRes, bossRes] = await Promise.all([
        supabase
          .from("eternum_guilds")
          .select("id,name,tag,level,bank_gold")
          .eq("id", myMembership.guild_id)
          .maybeSingle(),
        supabase
          .from("eternum_guild_boss_state")
          .select("guild_id,boss_tier,boss_hp_remaining,reset_at")
          .eq("guild_id", myMembership.guild_id)
          .maybeSingle(),
      ]);
      myGuild = (gRes.data as Guild | null) ?? null;
      guildBoss = (bossRes.data as GuildBoss | null) ?? null;
    }

    const [allRes, frRes, reqRes] = await Promise.all([
      supabase
        .from("eternum_guilds")
        .select("id,name,tag,level,bank_gold")
        .order("level", { ascending: false })
        .limit(20),
      supabase.rpc("eternum_get_friends"),
      supabase.rpc("eternum_get_friend_requests"),
    ]);
    allGuilds = (allRes.data ?? []) as Guild[];
    friends = (frRes.data ?? []) as Friend[];
    requests = (reqRes.data ?? []) as FriendRequest[];
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/rpg" className="text-zinc-400 hover:text-zinc-100">
            ← Eternum
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-emerald-200">👥 Social</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-hidden p-6">
        <SocialClient
          myGuild={myGuild}
          allGuilds={allGuilds}
          hasGuild={!!myMembership}
          guildBoss={guildBoss}
          friends={friends}
          requests={requests}
          hero={hero!}
          myFamiliers={myFamiliers}
        />
      </main>
    </div>
  );
}

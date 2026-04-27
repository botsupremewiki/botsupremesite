import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { fetchEternumHero } from "../_lib/supabase-helpers";
import { SocialClient } from "./social-client";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const profile = await getProfile();
  if (!profile) return <p className="p-6 text-zinc-400">Connecte-toi.</p>;
  const hero = await fetchEternumHero(profile.id);
  if (!hero) redirect("/play/rpg/personnage");

  const supabase = await createClient();
  type Guild = { id: string; name: string; tag: string; level: number; bank_gold: number };
  type Membership = { guild_id: string; role: string };
  let myGuild: Guild | null = null;
  let allGuilds: Guild[] = [];
  let myMembership: Membership | null = null;
  if (supabase) {
    const memRes = await supabase
      .from("eternum_guild_members")
      .select("guild_id,role")
      .eq("user_id", profile.id)
      .maybeSingle();
    myMembership = (memRes.data as Membership | null) ?? null;
    if (myMembership) {
      const gRes = await supabase
        .from("eternum_guilds")
        .select("id,name,tag,level,bank_gold")
        .eq("id", myMembership.guild_id)
        .maybeSingle();
      myGuild = (gRes.data as Guild | null) ?? null;
    }
    const allRes = await supabase
      .from("eternum_guilds")
      .select("id,name,tag,level,bank_gold")
      .order("level", { ascending: false })
      .limit(20);
    allGuilds = (allRes.data ?? []) as typeof allGuilds;
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
        <SocialClient myGuild={myGuild} allGuilds={allGuilds} hasGuild={!!myMembership} />
      </main>
    </div>
  );
}

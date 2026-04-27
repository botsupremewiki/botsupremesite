import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { UserPill } from "@/components/user-pill";
import { createClient } from "@/lib/supabase/server";
import { QuetesView } from "./quetes-view";

export const dynamic = "force-dynamic";

const ACHIEVEMENTS_CATALOG: Array<{
  id: string;
  name: string;
  reward: number;
  desc: string;
}> = [
  { id: "ach_first_village", name: "Premier village", reward: 0, desc: "Créer le compte" },
  { id: "ach_first_raid", name: "Premier raid", reward: 100, desc: "Premier raid réussi" },
  { id: "ach_first_blood", name: "Premier sang", reward: 100, desc: "Première unité ennemie tuée" },
  { id: "ach_first_barbarian", name: "Pillage barbare", reward: 100, desc: "Premier raid sur barbare" },
  { id: "ach_butcher", name: "Boucher", reward: 300, desc: "1 000 unités tuées cumul" },
  { id: "ach_massacre", name: "Massacre", reward: 1000, desc: "10 000 unités tuées cumul" },
  { id: "ach_hall_5", name: "Hôtel niveau 5", reward: 200, desc: "Hôtel de ville niveau 5" },
  { id: "ach_hall_10", name: "Hôtel niveau 10", reward: 500, desc: "Hôtel de ville niveau 10" },
  { id: "ach_hall_15", name: "Hôtel niveau 15", reward: 1000, desc: "Hôtel de ville niveau 15" },
  { id: "ach_hall_20", name: "Hôtel niveau 20", reward: 1500, desc: "Hôtel de ville niveau 20" },
  { id: "ach_hall_25", name: "Hôtel niveau 25", reward: 1500, desc: "Hôtel de ville niveau 25" },
  { id: "ach_oasis_first", name: "Conquête oasis", reward: 300, desc: "Première oasis conquise" },
  { id: "ach_oasis_triple", name: "Triade des oasis", reward: 1000, desc: "3 oasis simultanées" },
  { id: "ach_alliance_join", name: "Recrue", reward: 100, desc: "Rejoindre une alliance" },
  { id: "ach_alliance_chief", name: "Chef", reward: 300, desc: "Devenir chef d'alliance" },
  { id: "ach_war_first", name: "Belliciste", reward: 200, desc: "Première guerre déclarée" },
  { id: "ach_nap_first", name: "Pacificateur", reward: 100, desc: "Première NAP signée" },
  { id: "ach_loot_100k", name: "Petit pilleur", reward: 300, desc: "100k ressources lootées cumul" },
  { id: "ach_loot_1m", name: "Grand pilleur", reward: 1500, desc: "1M ressources lootées cumul" },
  { id: "ach_conquest_first", name: "Conquérant", reward: 1000, desc: "Premier village conquis" },
  { id: "ach_center_complete", name: "Centre complet", reward: 500, desc: "Tous les bâtiments du centre construits" },
  { id: "ach_forge_max", name: "Forge maxée", reward: 300, desc: "Première forge max sur 1 axe" },
  { id: "ach_elite_100", name: "Élite", reward: 500, desc: "100 unités d'élite recrutées" },
  { id: "ach_top10_atk", name: "Top hebdo attaque", reward: 200, desc: "Top 10 hebdo attaque" },
  { id: "ach_top10_def", name: "Top hebdo défense", reward: 200, desc: "Top 10 hebdo défense" },
  { id: "ach_top10_eco", name: "Top hebdo économie", reward: 200, desc: "Top 10 hebdo économie" },
  { id: "ach_crown_weekly", name: "Couronne hebdo", reward: 1000, desc: "Top 1 hebdo (toute catégorie)" },
  { id: "ach_power_100k", name: "Force grandissante", reward: 500, desc: "100k puissance totale" },
  { id: "ach_power_500k", name: "Force majeure", reward: 1000, desc: "500k puissance totale" },
  { id: "ach_first_builder", name: "Premier Bâtisseur", reward: 50000, desc: "Première merveille complétée" },
];

export default async function QuetesPage() {
  const profile = await getProfile();
  if (!profile) redirect("/play/imperium");

  const supabase = await createClient();
  const achievements = supabase
    ? (
        (
          await supabase
            .from("imperium_achievements")
            .select("*")
            .eq("user_id", profile.id)
        ).data ?? []
      )
    : [];
  const quests = supabase
    ? (
        (
          await supabase
            .from("imperium_quests")
            .select("*")
            .eq("user_id", profile.id)
            .gte("expires_at", new Date().toISOString())
        ).data ?? []
      )
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/play/imperium" className="text-zinc-400 hover:text-zinc-100">
            ← Imperium
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold text-sky-200">📋 Quêtes & succès</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(125,211,252,0.04),transparent_60%)]">
        <QuetesView
          achievements={achievements}
          quests={quests}
          catalog={ACHIEVEMENTS_CATALOG}
        />
      </main>
    </div>
  );
}

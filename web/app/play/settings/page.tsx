import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserPill } from "@/components/user-pill";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

type Preferences = {
  notifications_enabled?: boolean;
  notifications_trades?: boolean;
  notifications_tournaments?: boolean;
  notifications_seasons?: boolean;
  sounds_enabled?: boolean;
  compact_mode?: boolean;
};

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/");
  let prefs: Preferences = {};
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", profile.id)
      .maybeSingle();
    prefs = (data as { preferences?: Preferences } | null)?.preferences ?? {};
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/play"
            className="text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            ← Plaza
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="font-semibold">⚙️ Paramètres</span>
        </div>
        <UserPill profile={profile} variant="play" />
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center overflow-y-auto p-6"
      >
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-bold text-zinc-100">⚙️ Paramètres</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Tes préférences sont enregistrées et synchronisées sur tous tes
            appareils.
          </p>
          <SettingsClient initialPreferences={prefs} />
        </div>
      </main>
    </div>
  );
}

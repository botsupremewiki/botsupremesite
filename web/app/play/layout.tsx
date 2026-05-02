import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient, isAuthConfigured } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/toast";
import { CommandPalette } from "@/components/command-palette";
import { OnboardingTour } from "@/components/onboarding-tour";
import { ProfilePopupProvider } from "@/components/profile-popup-context";
import { ProfilePopupHost } from "@/components/profile-popup";

// Toute la zone /play (plaza, casino, RPG, TCG, Imperium, Skyline, …) est
// désormais réservée aux utilisateurs connectés via Discord. Plus de mode
// "anonyme" : si tu n'es pas authentifié, on te renvoie sur /join qui lance
// le flow OAuth Discord puis te ramène ici.
//
// Si Supabase n'est pas configuré (cas dev sans .env.local), on laisse
// passer pour ne pas bloquer le développement local.
export const dynamic = "force-dynamic";

export default async function PlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let needsOnboarding = false;
  if (isAuthConfigured()) {
    const profile = await getProfile();
    if (!profile) {
      redirect("/join");
    }
    // Check si l'user a déjà fait l'onboarding global du site.
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", profile.id)
        .maybeSingle();
      const row = data as { onboarded_at: string | null } | null;
      needsOnboarding = !row?.onboarded_at;
    }
  }
  return (
    <ToastProvider>
      <ProfilePopupProvider>
        {children}
        <CommandPalette />
        <OnboardingTour active={needsOnboarding} />
        {/* Popup profil rendue à la racine — ouverte via
            useProfilePopup().open(username) depuis n'importe où. */}
        <ProfilePopupHost />
      </ProfilePopupProvider>
    </ToastProvider>
  );
}

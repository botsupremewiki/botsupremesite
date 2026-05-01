import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/toast";
import { CommandPalette } from "@/components/command-palette";

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
  if (isAuthConfigured()) {
    const profile = await getProfile();
    if (!profile) {
      redirect("/join");
    }
  }
  return (
    <ToastProvider>
      {children}
      <CommandPalette />
    </ToastProvider>
  );
}

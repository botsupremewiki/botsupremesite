import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { isAuthConfigured } from "@/lib/supabase/server";

// Toute la zone /admin est gardée derrière `is_admin`. Cette colonne est
// elle-même dérivée du rôle Discord ADMIN à chaque login (cf.
// shared/discord-roles.ts), donc retirer le rôle Discord = perdre l'accès
// admin au prochain login. Pas de manip SQL nécessaire.
//
// Si le site est lancé sans Supabase (cas dev rare), on laisse passer
// pour pouvoir bidouiller localement — pas de DB = pas d'enjeux.

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isAuthConfigured()) {
    const profile = await getProfile();
    if (!profile) {
      redirect("/join");
    }
    if (!profile.is_admin) {
      redirect("/play");
    }
  }
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {children}
    </main>
  );
}

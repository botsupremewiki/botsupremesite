import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();

  // Dev-only fallback : si Supabase n'est pas configuré (.env.local absent),
  // on laisse passer pour ne pas bloquer le développement local.
  // En production le layout /play garantit qu'on n'arrive ici que connecté
  // ou en train de se connecter, donc ce fallback ne devrait jamais être
  // emprunté par un visiteur réel.
  if (!supabase) {
    return NextResponse.redirect(new URL("/play", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already logged in — skip OAuth and send them to the plaza.
  if (user) {
    return NextResponse.redirect(new URL("/play", origin));
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback?next=/play`,
      // `guilds.members.read` permet de lire le pseudo + rôles du joueur
      // pour le serveur Discord configuré dans DISCORD_GUILD_ID.
      scopes: "identify email guilds.members.read",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/?error=auth", origin));
  }

  return NextResponse.redirect(data.url);
}

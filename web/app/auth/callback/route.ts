import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncDiscordProfile } from "@/lib/discord-sync";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/play";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Synchronisation du pseudo serveur Discord en best-effort.
        // Si ça foire (joueur pas dans le serveur, scope manquant, etc.),
        // on log et on laisse passer le login : l'utilisateur garde son
        // username actuel ou celui calculé par le trigger SQL handle_new_user.
        const providerToken = data.session?.provider_token;
        if (data.session?.user && providerToken) {
          try {
            const sync = await syncDiscordProfile(
              data.session.user.id,
              providerToken,
            );
            if (!sync.ok) {
              console.warn("[auth/callback] discord sync skipped:", sync.reason);
            }
          } catch (e) {
            console.error("[auth/callback] discord sync threw:", e);
          }
        }
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}

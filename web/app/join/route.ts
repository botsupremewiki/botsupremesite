import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();

  // If Supabase isn't configured, just drop the user straight into the plaza
  // in anonymous mode.
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
      scopes: "identify email",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/?error=auth", origin));
  }

  return NextResponse.redirect(data.url);
}

// Dev/Test-only auth bypass pour les tests E2E Playwright.
//
// Cette route n'est active QUE si E2E_TEST_SECRET est défini en env.
// En production normale (Vercel sans cette var), elle retourne 404
// pour ne pas exposer un vecteur d'auth bypass.
//
// Le test fixture `authedPage` (tests/_fixtures.ts) hit cette route
// avec le secret pour pouvoir tester les pages protégées.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.E2E_TEST_SECRET;
  // Si pas configuré, route 404 (n'existe pas pour la prod).
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Vérifie le secret.
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
  };
  const userId = body.userId;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Set un cookie de session minimal.
  // Note : ne génère pas un VRAI JWT Supabase. Pour des tests qui
  // nécessitent une session valide côté Supabase RLS, il faut :
  //   1. Soit utiliser supabase.auth.admin.createUser() + signInAsUser
  //      (requires service_role key)
  //   2. Soit ce cookie sert juste à passer le check getProfile() de
  //      /play layout (qui lit profiles.id par cookie middleware)
  //
  // Pour la v1 on stocke juste un marker e2e:user_id que getProfile()
  // peut détecter en mode test (à câbler dans @/lib/auth si besoin).
  const cookieStore = await cookies();
  cookieStore.set("e2e-test-user", userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.VERCEL_ENV === "production",
    maxAge: 60 * 60, // 1h pour la durée d'une suite de tests
    path: "/",
  });

  return NextResponse.json({ ok: true, userId });
}

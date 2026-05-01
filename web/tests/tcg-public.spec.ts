// Tests sur les pages TCG publiques (méta + replays + page card encyclopedia).
// Ces pages sont accessibles aux invités selon leurs RLS Supabase.
//
// Le test vérifie juste que la page se charge sans crash, pas que les
// données s'affichent (qui dépendent de l'état de la DB).

import { test, expect } from "@playwright/test";

test.describe("TCG pages publiques", () => {
  test("/play/tcg/pokemon/meta se charge", async ({ page }) => {
    const resp = await page.goto("/play/tcg/pokemon/meta");
    // Auth-redirect ou contenu : pas de 5xx.
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/cards/A1-001 (Bulbizarre) se charge", async ({
    page,
  }) => {
    const resp = await page.goto("/play/tcg/pokemon/cards/A1-001");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/cards/INVALID renvoie 404", async ({ page }) => {
    const resp = await page.goto("/play/tcg/pokemon/cards/INVALID-CARD-ID");
    // Next.js notFound() → 404
    expect(resp?.status()).toBe(404);
  });
});

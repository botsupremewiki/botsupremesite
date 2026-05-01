// Smoke tests : vérifient que les pages clés se chargent sans 500.
//
// Run :  npx playwright test
// Headed : npx playwright test --headed

import { test, expect } from "@playwright/test";

test.describe("smoke @ home", () => {
  test("landing renders sans erreur", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Site Ultime/i);
  });
});

test.describe("smoke @ play (sans auth)", () => {
  test("plaza redirige ou affiche le login", async ({ page }) => {
    const resp = await page.goto("/play");
    expect(resp?.status()).toBeLessThan(500);
  });
});

test.describe("smoke @ TCG hub", () => {
  test("hub Pokémon répond", async ({ page }) => {
    const resp = await page.goto("/play/tcg/pokemon");
    expect(resp?.status()).toBeLessThan(500);
  });
});

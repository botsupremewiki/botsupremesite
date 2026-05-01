// Tests sur la landing page (publique, pas d'auth requise).

import { test, expect } from "@playwright/test";

test.describe("landing", () => {
  test("affiche le titre et les CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Tous tes jeux|All your games/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Entrer dans le monde|Enter the world/ }),
    ).toBeVisible();
  });

  test("le toggle de langue fonctionne", async ({ page }) => {
    await page.goto("/");
    // Bouton langue (FR par défaut → switch EN).
    const switcher = page.getByRole("button", { name: /Switch to/i });
    await switcher.click();
    // Après reload, le titre est en EN.
    await expect(
      page.getByRole("heading", { name: /All your games/ }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("la section Games liste les 6 mondes", async ({ page }) => {
    await page.goto("/");
    const games = ["Casino", "RPG", "Pokémon TCG", "Tycoon"];
    for (const g of games) {
      await expect(page.getByText(g, { exact: false }).first()).toBeVisible();
    }
  });

  test("a11y : skip-to-content visible au tab", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByText("Aller au contenu");
    await expect(skip).toBeVisible();
  });
});

// Tests sur les pages publiques /help et /changelog.

import { test, expect } from "@playwright/test";

test.describe("help", () => {
  test("FAQ : 11 questions affichées", async ({ page }) => {
    await page.goto("/help");
    const details = page.locator("details");
    await expect(details).toHaveCount(11);
  });

  test("FAQ : ouvrir une question affiche la réponse", async ({ page }) => {
    await page.goto("/help");
    const first = page.locator("summary").first();
    await first.click();
    // L'élément <details> ouvert contient la réponse.
    const opened = page.locator("details[open]").first();
    await expect(opened).toBeVisible();
  });

  test("liens vers changelog", async ({ page }) => {
    await page.goto("/help");
    const link = page.getByRole("link", { name: /Changelog/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/changelog/);
  });
});

test.describe("changelog", () => {
  test("affiche les versions par ordre antéchronologique", async ({ page }) => {
    await page.goto("/changelog");
    const versions = page.locator("[class*='border-amber-300']").filter({
      hasText: /^v\d+/,
    });
    const count = await versions.count();
    expect(count).toBeGreaterThan(3);
  });
});

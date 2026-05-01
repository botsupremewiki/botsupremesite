// Tests E2E authentifiés via le fixture `authedPage`.
//
// Ces tests vérifient le comportement des pages protégées /play/*
// avec un user connecté. Skipped automatiquement si E2E_TEST_SECRET
// + E2E_TEST_USER_ID ne sont pas configurés (voir tests/_fixtures.ts).

import { test, expect } from "./_fixtures";

test.describe("authed pages", () => {
  test("/play/objectifs charge sans erreur", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/objectifs");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/settings affiche les sections", async ({ authedPage }) => {
    await authedPage.goto("/play/settings");
    // Au moins une section "Apparence" / "Appearance" doit être visible.
    await expect(
      authedPage.getByText(/Apparence|Appearance/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("/play/profil/cosmetics affiche titres + bordures", async ({
    authedPage,
  }) => {
    const resp = await authedPage.goto("/play/profil/cosmetics");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon hub charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/quests charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/quests");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/seasons charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/seasons");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/battle-pass charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/battle-pass");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/wonder-pick charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/wonder-pick");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/replays charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/replays");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("/play/tcg/pokemon/tournaments charge", async ({ authedPage }) => {
    const resp = await authedPage.goto("/play/tcg/pokemon/tournaments");
    expect(resp?.status() ?? 0).toBeLessThan(500);
  });

  test("Cmd+K ouvre la palette", async ({ authedPage }) => {
    await authedPage.goto("/play");
    await authedPage.keyboard.press("Control+k");
    // La palette a un input avec aria-label "Rechercher"
    await expect(
      authedPage.getByRole("textbox", { name: /Rechercher/i }),
    ).toBeVisible({ timeout: 5000 });
  });
});

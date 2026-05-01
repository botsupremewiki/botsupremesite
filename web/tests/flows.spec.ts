// Tests E2E pour les flows interactifs critiques.
//
// Ces tests nécessitent un user authentifié + une vraie session
// Supabase pour passer les RLS (les RPCs sont security-definer mais
// vérifient auth.uid()).
//
// Statut : skeleton — chaque test est marqué `test.skip` tant que
// le pattern d'auth Supabase complet n'est pas implémenté dans
// `tests/_fixtures.ts` (cf. README section "Pour étendre vers des
// flows complets").

import { test, expect } from "./_fixtures";

test.describe("flow : achat booster Pokémon", () => {
  test.skip("achat d'un pack Mewtwo débite 100 OS et crédite 5 cartes", async ({
    authedPage,
  }) => {
    await authedPage.goto("/play/tcg/pokemon/boosters");
    // Note du gold initial (lu via le UserPill).
    const goldBefore = await authedPage
      .locator("[data-testid=user-gold]")
      .textContent();
    // Click sur le pack Mewtwo.
    await authedPage.getByRole("button", { name: /Mewtwo/ }).click();
    // Confirme l'achat dans le modal.
    await authedPage.getByRole("button", { name: /Confirmer/ }).click();
    // Attend la révélation des cartes.
    await expect(authedPage.locator(".card-foil")).toHaveCount(5, {
      timeout: 10000,
    });
    // Le gold a été débité.
    const goldAfter = await authedPage
      .locator("[data-testid=user-gold]")
      .textContent();
    expect(Number(goldAfter)).toBeLessThan(Number(goldBefore));
  });
});

test.describe("flow : créer un deck", () => {
  test.skip("créer + sauvegarder + retrouver un deck", async ({
    authedPage,
  }) => {
    await authedPage.goto("/play/tcg/pokemon/decks");
    await authedPage.getByRole("button", { name: /Nouveau deck/ }).click();
    // Ajoute 20 cartes (drag-drop ou clic depuis la collection).
    for (let i = 0; i < 20; i++) {
      await authedPage
        .locator("[data-testid=collection-card]")
        .first()
        .click();
    }
    // Nomme le deck + save.
    await authedPage.fill('input[name="deckName"]', "Test Deck");
    await authedPage.getByRole("button", { name: /Sauvegarder/ }).click();
    // Vérifie qu'il apparaît dans la liste.
    await expect(authedPage.getByText("Test Deck")).toBeVisible();
  });
});

test.describe("flow : match vs Bot Suprême", () => {
  test.skip("lancer un match bot et l'abandonner", async ({ authedPage }) => {
    await authedPage.goto("/play/tcg/pokemon/battle/bot");
    // Sélectionne le 1er deck.
    await authedPage.locator("[data-testid=deck-pick]").first().click();
    // Lance le match.
    await authedPage.getByRole("button", { name: /Lancer/ }).click();
    // Attend que la phase 'playing' démarre.
    await expect(authedPage.locator("text=tour 1")).toBeVisible({
      timeout: 15000,
    });
    // Abandonne pour terminer rapidement.
    await authedPage.getByRole("button", { name: /Abandonner/ }).click();
    // Banner défaite visible.
    await expect(authedPage.locator("text=Défaite")).toBeVisible();
  });
});

test.describe("flow : claim quête journalière", () => {
  test.skip("claim de la quête play_3 après 3 matches", async ({
    authedPage,
  }) => {
    // Pré-requis : 3 matches déjà joués (via DB seed ou via flow
    // précédent qui en a généré).
    await authedPage.goto("/play/tcg/pokemon/quests");
    // La quête play_3 doit être unlocked (3/3).
    const quest = authedPage
      .locator("text=Joue 3 matchs PvP")
      .locator("..");
    await quest.getByRole("button", { name: /Réclamer/ }).click();
    // Toast success affiche le gold gagné.
    await expect(authedPage.locator("text=+100 OS")).toBeVisible();
  });
});

test.describe("flow : trade entre 2 users", () => {
  test.skip("user A propose un trade à user B, B accepte", async () => {
    // Nécessite 2 sessions Playwright en parallèle (2 contexts).
    // Pattern : test.use({ storageState: "userA.json" }) +
    // browser.newContext({ storageState: "userB.json" })
    // Trop complexe pour le squelette, à implémenter après l'auth
    // mock complet.
  });
});

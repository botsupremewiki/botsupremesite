/**
 * Fixtures Playwright partagées : login mock pour les tests authentifiés.
 *
 * Le site utilise Discord OAuth qu'on ne peut pas mocker côté client en
 * E2E. À la place, on génère un cookie de session Supabase via une
 * route dev-only `/api/dev/login-as-test-user` qui n'existe que si
 * `process.env.E2E_TEST_SECRET` est défini.
 *
 * Pour activer les tests authentifiés :
 *  1. Définir E2E_TEST_SECRET dans .env.test (ou .env.local en dev)
 *  2. Définir E2E_TEST_USER_ID = uuid d'un user existant en DB
 *  3. Run npx playwright test (les fixtures `authedPage` deviennent
 *     utilisables)
 *
 * En CI, les variables sont absentes → les tests authentifiés sont
 * skipped via `test.skip()`.
 */

import { test as base, type Page } from "@playwright/test";

type Fixtures = {
  /** Page authentifiée comme user de test. Utiliser à la place de
   *  `page` dans les tests qui nécessitent un user connecté. */
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ page, baseURL }, use) => {
    const secret = process.env.E2E_TEST_SECRET;
    const userId = process.env.E2E_TEST_USER_ID;
    if (!secret || !userId) {
      test.skip(
        true,
        "E2E_TEST_SECRET ou E2E_TEST_USER_ID manquant — voir tests/_fixtures.ts",
      );
      await use(page);
      return;
    }
    // Hit la route dev-only qui set un cookie de session.
    const resp = await page.request.post(
      `${baseURL ?? "http://localhost:3000"}/api/dev/login-as-test-user`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        data: { userId },
      },
    );
    if (!resp.ok()) {
      test.skip(
        true,
        `Auth dev failed (${resp.status()}). Vérifie .env.local ou la route /api/dev/login-as-test-user.`,
      );
    }
    await use(page);
  },
});

export { expect } from "@playwright/test";

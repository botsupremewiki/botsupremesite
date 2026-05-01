// Configuration Playwright minimale pour smoke tests E2E.
//
// Pour activer :
//   1. cd web && npm i -D @playwright/test
//   2. npx playwright install
//   3. npm run e2e (à ajouter dans package.json scripts)
//
// Les tests sont dans web/tests/ — voir web/tests/smoke.spec.ts.
// CI : utiliser process.env.CI pour skip auto-start du dev server.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30 * 1000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});

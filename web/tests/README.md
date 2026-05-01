# Tests E2E Playwright

## Setup

```bash
cd web
npm i -D @playwright/test
npx playwright install chromium
```

## Lancer

```bash
# Tous les tests
npm run e2e

# UI interactive
npm run e2e:ui

# Un fichier spécifique
npx playwright test landing.spec.ts

# Headed (voir le navigateur)
npx playwright test --headed
```

## Couverture actuelle

### Smoke tests (`smoke.spec.ts`)
- Landing renders
- /play retourne sans 5xx
- /play/tcg/pokemon retourne sans 5xx

### Landing (`landing.spec.ts`)
- Titre + CTA visibles
- Toggle de langue FR ⇄ EN fonctionne
- Section Games liste les 6 mondes
- A11y : skip-to-content link au tab

### Auth flow (`auth-flow.spec.ts`)
- /play sans auth redirige vers /join (ou laisse passer en dev mode)
- /join accessible sans auth
- Pages publiques (/, /help, /changelog) se chargent

### Help & Changelog (`help-changelog.spec.ts`)
- FAQ : 11 questions affichées
- Ouvrir une question révèle la réponse
- Lien help → changelog fonctionne
- Changelog : versions affichées

### TCG pages publiques (`tcg-public.spec.ts`)
- /play/tcg/pokemon/meta se charge
- Carte encyclopédie A1-001 (Bulbizarre) se charge
- Carte invalide → 404

## Tests authentifiés (pas implémentés)

Tests qui nécessitent un user connecté (achat booster, build deck,
match bot) ne sont pas implémentés en E2E faute de setup OAuth Discord
mockable. Pour les ajouter :

1. Créer un user de test dans Supabase staging
2. Setter manuellement un cookie de session avant chaque test
3. Tester les flows complets

Voir `playwright.config.ts` pour la config (storageState, baseURL).

## CI

Set `process.env.CI=1` pour skip l'auto-start du dev server. Configure
`PLAYWRIGHT_BASE_URL` vers l'URL de preview Vercel pour tester contre
le déploiement.

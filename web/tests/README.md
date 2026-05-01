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

## Tests authentifiés

Le fixture `authedPage` (`tests/_fixtures.ts`) hit la route dev-only
`/api/dev/login-as-test-user` qui set un cookie de session basique.

### Activation

1. Créer un user de test dans Supabase (noter son UUID)
2. Définir dans `.env.local` :
   ```
   E2E_TEST_SECRET=un-secret-aléatoire-long
   E2E_TEST_USER_ID=uuid-du-user-de-test
   ```
3. `npx playwright test authed-pages.spec.ts`

Si les vars manquent, les tests sont automatiquement skipped via
`test.skip()` (pas d'échec en CI sans setup).

**Sécurité** : la route `/api/dev/login-as-test-user` retourne 404
si `E2E_TEST_SECRET` n'est pas défini en env. Impossible d'exploiter
en production qui ne définit jamais cette var.

### Tests inclus (`authed-pages.spec.ts`)

- /play/objectifs charge
- /play/settings affiche les sections
- /play/profil/cosmetics charge
- /play/tcg/pokemon hub charge
- /play/tcg/pokemon/{quests,seasons,battle-pass,wonder-pick,replays,tournaments} chargent
- Cmd+K ouvre la palette de commandes

### Pour étendre vers des flows complets

Tests interactifs (achat booster, build deck, match bot) nécessitent
une session JWT Supabase valide pour passer la RLS. Plan :

1. Étendre `/api/dev/login-as-test-user` pour générer un JWT via
   `supabase.auth.admin.generateLink({ type: 'magiclink' })`
2. Set le cookie `sb-access-token` + `sb-refresh-token` dans la
   réponse de la route
3. Le test peut alors faire de vraies actions (RPC calls qui
   passent les RLS)

## CI

Set `process.env.CI=1` pour skip l'auto-start du dev server. Configure
`PLAYWRIGHT_BASE_URL` vers l'URL de preview Vercel pour tester contre
le déploiement.

# Site Ultime

Univers 2D multijoueur — un seul monde pour y héberger casino, RPG, Pokémon TCG, jeux de cartes et jeux de gestion.

## Stack

- **Front** : [Next.js 16](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS v4
- **Rendu 2D** : [PixiJS 8](https://pixijs.com)
- **Animations UI** : [Framer Motion](https://www.framer.com/motion/)
- **Temps réel / rooms** : [PartyKit](https://www.partykit.io) (serverless, basé Cloudflare Durable Objects)
- **Client WebSocket** : `partysocket`
- **State client** : `zustand`
- **Auth + DB** : [Supabase](https://supabase.com) (Discord OAuth, SSR via `@supabase/ssr`)

## Structure

```
site-ultime/
├── web/
│   ├── app/
│   │   ├── page.tsx           # Landing
│   │   ├── landing-content.tsx # Hero + games (client, anim)
│   │   ├── actions/auth.ts    # Server actions auth (sign in/out)
│   │   ├── auth/callback/     # OAuth callback (Supabase)
│   │   └── play/              # Le monde 2D
│   ├── components/            # UserMenu, UserPill, SignInButton
│   ├── lib/
│   │   ├── game/plaza.ts      # Scène PixiJS
│   │   ├── supabase/          # Clients browser + serveur
│   │   └── auth.ts            # getUser / getProfile
│   └── proxy.ts               # Rafraîchit la session Supabase (ex-middleware)
├── party/                     # Serveurs PartyKit (rooms temps réel)
├── shared/                    # Types TS partagés web ↔ party
├── supabase/profiles.sql      # Schéma DB à exécuter dans Supabase
└── package.json               # npm workspaces
```

## Démarrage local (sans auth)

Prérequis : Node 20+.

```bash
npm install
npm run dev
```

Lance en parallèle :
- **Next.js** sur <http://localhost:3000>
- **PartyKit** sur <http://127.0.0.1:1999>

L'app marche en mode **anonyme** : chaque joueur reçoit un pseudo `Invité-XXXX` qu'il peut modifier localement.

## Activer l'auth Discord (optionnel mais recommandé)

Pour avoir un vrai compte persistant, or/inventaire, synchronisation entre appareils.

### 1. Créer un projet Supabase

1. Va sur <https://supabase.com>, crée un compte (gratuit) et un nouveau projet
2. Dans **Project Settings → API**, récupère :
   - `Project URL` → ira dans `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → ira dans `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Créer l'application Discord

1. Va sur <https://discord.com/developers/applications> → **New Application**
2. Onglet **OAuth2** → ajoute la redirect URL :
   - `https://<ton-project-ref>.supabase.co/auth/v1/callback`
   - (l'URL est fournie par Supabase dans Authentication → Providers → Discord)
3. Copie le **Client ID** et **Client Secret**

### 3. Configurer le provider Discord dans Supabase

1. Dans Supabase → **Authentication → Providers → Discord**
2. Active le provider, colle le Client ID et le Client Secret
3. Dans **URL Configuration**, mets :
   - Site URL : `http://localhost:3000` (en dev) ou ton domaine prod
   - Redirect URLs : `http://localhost:3000/auth/callback` (et la version prod)

### 4. Créer la table `profiles`

Copie-colle le contenu de [`supabase/profiles.sql`](supabase/profiles.sql) dans l'éditeur SQL de Supabase et exécute. Ça crée :
- Table `profiles` (username, avatar_url, gold)
- RLS pour que chacun ne puisse modifier que son profil
- Trigger qui crée automatiquement un profil à la première connexion

### 5. Ajouter les variables d'env

Crée `web/.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# PartyKit — vide en dev local
NEXT_PUBLIC_PARTYKIT_HOST=
```

Relance `npm run dev`. Le bouton **Se connecter avec Discord** apparaît dans le nav et dans la plaza.

## Persistance de l'Or Suprême (blackjack & autres jeux)

Pour que les gains/pertes soient sauvegardés dans Supabase entre les sessions,
le serveur PartyKit doit pouvoir écrire dans la table `profiles` via la
`service_role` key (clé admin Supabase).

### Récupérer la service role key

Supabase dashboard → **Project Settings → API** → section **Project API keys**
→ copie `service_role` (⚠️ clé secrète, ne JAMAIS la mettre côté client, ne
JAMAIS la commiter).

### Ajouter en dev local

Crée `party/.env` (gitignored) :

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # service_role key
```

Relance `npm run dev:party`.

### Ajouter en prod (PartyKit Cloud)

```bash
npx partykit env add SUPABASE_URL --workspace=party
# colle l'URL quand demandé

npx partykit env add SUPABASE_SERVICE_ROLE_KEY --workspace=party
# colle la service_role key quand demandé
```

Puis redéploie :

```bash
npm run deploy --workspace=party
```

Sans ces variables, le jeu fonctionne mais l'or ne persiste pas entre
sessions (chaque reload repart de la valeur enregistrée dans Supabase).

## Poster le message d'accueil dans Discord (bot)

Un petit script bot one-shot poste un embed dans un salon avec un bouton
**Entrer dans le monde** qui redirige vers `/join`. Cette route déclenche l'OAuth
Discord automatiquement — si le visiteur est déjà connecté à Discord dans son
navigateur (quasi toujours), c'est 1 redirect silencieux et il atterrit dans la
plaza avec son compte.

### 1. Activer le bot Discord

1. Dans <https://discord.com/developers/applications>, ouvre l'app que tu as créée pour l'OAuth
2. Onglet **Bot** → active-le, puis **Reset Token** et copie le token
3. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`
   - Permissions : `Send Messages`, `Embed Links`, `View Channel`
4. Ouvre l'URL générée pour inviter le bot dans ton serveur

### 2. Récupérer l'ID du salon

1. Discord → Paramètres utilisateur → Avancés → active **Mode développeur**
2. Clic droit sur le salon cible → **Copier l'ID du salon**

### 3. Configurer `bot/.env`

Copie `bot/.env.example` en `bot/.env` et remplis :

```env
DISCORD_BOT_TOKEN=token_du_bot
DISCORD_WELCOME_CHANNEL_ID=123456789012345678
SITE_URL=http://localhost:3000  # ou ton domaine prod
```

### 4. Poster (ou mettre à jour) le message

```bash
npm run bot:post       # poste un nouveau message
npm run bot:update     # édite le message existant (nécessite DISCORD_WELCOME_MESSAGE_ID dans bot/.env)
```

Le script s'éteint tout seul après l'envoi — pas besoin de serveur bot qui tourne 24/7.

## Comment tester le multijoueur

1. Ouvre <http://localhost:3000> dans un navigateur
2. Clique sur **Entrer dans le monde**
3. Ouvre la même URL dans un autre onglet / fenêtre privée
4. Tu verras ton avatar dans l'autre onglet et vice-versa
5. Clique sur la plaza pour te déplacer, écris dans le chat pour discuter

## Feuille de route

### Phase 1 — Fondations (fait)
- [x] Monorepo + stack
- [x] Landing animée
- [x] Plaza multijoueur (PixiJS + PartyKit)
- [x] Click-to-move + chat

### Phase 2 — Identité & profil (en cours)
- [x] Auth Discord OAuth via Supabase
- [x] Profil persistant (username, avatar, or)
- [ ] Portails cliquables → téléportation vers sous-rooms
- [ ] Sous-room **Casino** (hub des tables)
- [ ] Premier jeu : **Blackjack** multijoueur

### Phase 3 — Jeux casino
Hi-Lo, Mines, Slots (solo), Roulette partagée, Poker multi.

### Phase 4+
Pokémon TCG, RPG, jeux de gestion (médiéval, tycoon).

## Notes techniques

- **Stack 100% free tier** : Vercel (front) + PartyKit (temps réel, Cloudflare Workers) + Supabase (auth + DB, 50k users + 500 MB DB).
- Logique de jeu avec enjeu (casino, PVP) **toujours côté serveur** (parties PartyKit), jamais côté client — anti-triche.
- Next.js 16 renomme `middleware.ts` → `proxy.ts` (même concept).
- Pour l'instant, l'identité envoyée à PartyKit (`authId`/`name`) est **trust-on-first-use** côté client. Avant de mettre de l'argent réel en jeu, on passera un JWT Supabase vérifié côté PartyKit.

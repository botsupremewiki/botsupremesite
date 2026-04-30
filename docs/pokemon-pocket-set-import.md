# Importer un nouveau set Pokémon TCG Pocket

Le site supporte plusieurs sets Pokémon Pocket (A1, A1a, A2…) via le
registry `shared/tcg-pokemon-sets.ts`. Voici la procédure pour ajouter
un nouveau set.

## 1) Fetch les cartes depuis tcgdex.net

```bash
node scripts/generate-pocket-cards-fr.mjs --set=A1a
```

Cela produit `scripts/pocket-cards-A1a-fr.json`. (Le script existant
gère déjà l'arg `--set=`.)

> **Si le set ne contient pas les `boosters[]` officiels** (cas des
> sets sans extension de boosters Pocket), il faudra ajuster le script
> pour assigner manuellement les boosters par défaut.

## 2) Convertir en TS typé

```bash
node scripts/pocket-json-to-ts.mjs \
  --in=scripts/pocket-cards-A1a-fr.json \
  --out=shared/tcg-pokemon-a1a.ts \
  --export=POKEMON_A1A_SET
```

Cela produit `shared/tcg-pokemon-a1a.ts` avec :
- `export const POKEMON_A1A_SET: PokemonCardData[]`
- `export const POKEMON_A1A_SET_BY_ID: Map<string, PokemonCardData>`

## 3) Inscrire le set dans le registry

Édite `shared/tcg-pokemon-sets.ts` :

```ts
import { POKEMON_A1A_SET } from "./tcg-pokemon-a1a";

export const POKEMON_SETS: PokemonSetMeta[] = [
  // … (set existant)
  {
    id: "A1a",
    name: "Île Mythique",
    cards: POKEMON_A1A_SET,
    releasedAt: "2024-12-17",
    active: true,
  },
];
```

## 4) Vérifier les attaques implémentées

Lance le script d'audit (à créer si pas existant) qui vérifie que tous
les `attacks[]` du nouveau set sont matched par le parser dans
`party/src/battle.ts`. Les attaques avec un effet inconnu (pas matched)
seront jouées comme dégâts simples sans effet.

```bash
# TODO : créer scripts/audit-pokemon-attacks.mjs
```

## 5) Ajuster les boosters dans les types partagés

Si le nouveau set a ses propres types de boosters (ex. "Mew", "Dialga"
pour A2), édite `shared/types.ts` :
- `PokemonPackTypeId` : ajouter les nouveaux ids
- `POKEMON_PACK_TYPES` : ajouter les métadonnées (nom, glyph, accent…)

Et côté `party/src/tcg.ts`, ajuster les pools de tirage pour assigner
les nouvelles cartes aux nouveaux boosters.

## Notes

- L'UI collection a déjà un filtre par set (chips "A1+P-A", "A1a"…)
  qui apparaît automatiquement dès qu'on a au moins 2 sets dans
  `POKEMON_SETS`.
- Le market et la page Méta utilisent `POKEMON_BASE_SET_BY_ID` pour
  les images. Si une carte d'un nouveau set est référencée mais pas
  encore importée, son image fallback sera affichée.

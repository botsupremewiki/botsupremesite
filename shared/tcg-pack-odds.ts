// Probabilités d'apparition par rareté dans un booster, pour les 3 TCG.
// Utilisé côté client pour afficher « X% de chance par pack » sur l'écran
// détail booster.
//
// IMPORTANT — duplique les weights définis dans `party/src/tcg.ts` :
//   • _CORE_WEIGHTS / _MID_WEIGHTS / _UPPER_WEIGHTS / _HIGH_WEIGHTS / _RARE_WEIGHTS
//   • PACK_LAYOUT (combien de slots core/mid/upper avant high+rare)
//
// Si tu changes les weights ou le layout côté serveur, mets aussi à jour ce
// fichier sinon le % affiché sera désynchronisé du vrai drop rate.
//
// Composition d'un pack (5 tiers) :
//   • L slots "regular-core"   (commune pure)
//   • M slots "regular-mid"    (commune dominante + chance d'uncommon)
//   • U slots "regular-upper"  (uncommon dominant + chance de rare)
//   • 1 slot "regular-high"
//   • 1 slot "rare"
// avec L + M + U + 2 = packSize, défini dans LAYOUT par jeu.
//
// Le pack rate d'une rareté X = P(au moins 1 X dans le pack)
//   = 1 - (1 - p_core(X))^L × (1 - p_mid(X))^M × (1 - p_upper(X))^U
//         × (1 - p_high(X)) × (1 - p_rare(X))

import type { OnePieceRarity, RuneterraRarity, TcgRarity } from "./types";

// ─── Pokémon TCG Pocket ───────────────────────────────────────────────────

const POKEMON_CORE: Record<TcgRarity, number> = {
  "diamond-1": 100,
  "diamond-2": 0,
  "diamond-3": 0,
  "diamond-4": 0,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const POKEMON_MID: Record<TcgRarity, number> = {
  "diamond-1": 70,
  "diamond-2": 28,
  "diamond-3": 2,
  "diamond-4": 0,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const POKEMON_UPPER: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 80,
  "diamond-3": 18,
  "diamond-4": 2,
  "star-1": 0,
  "star-2": 0,
  "star-3": 0,
  crown: 0,
  promo: 0,
};

const POKEMON_HIGH: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 60,
  "diamond-3": 24,
  "diamond-4": 12.5,
  "star-1": 2.7,
  "star-2": 0.5,
  "star-3": 0.25,
  crown: 0.05,
  promo: 0,
};

const POKEMON_RARE: Record<TcgRarity, number> = {
  "diamond-1": 0,
  "diamond-2": 0,
  "diamond-3": 70,
  "diamond-4": 23.5,
  "star-1": 4,
  "star-2": 2,
  "star-3": 1,
  crown: 0.5,
  promo: 0,
};

// ─── One Piece TCG ────────────────────────────────────────────────────────

const ONEPIECE_CORE: Record<OnePieceRarity, number> = {
  c: 100,
  uc: 0,
  r: 0,
  sr: 0,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const ONEPIECE_MID: Record<OnePieceRarity, number> = {
  c: 65,
  uc: 33,
  r: 2,
  sr: 0,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const ONEPIECE_UPPER: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 75,
  r: 23,
  sr: 2,
  sec: 0,
  l: 0,
  p: 0,
  tr: 0,
  sp: 0,
  don: 0,
};

const ONEPIECE_HIGH: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 55,
  r: 27,
  sr: 9,
  sec: 1.5,
  l: 2,
  p: 0,
  tr: 0,
  sp: 1,
  don: 0,
};

const ONEPIECE_RARE: Record<OnePieceRarity, number> = {
  c: 0,
  uc: 0,
  r: 50,
  sr: 24,
  sec: 5,
  l: 14,
  p: 1,
  tr: 0.5,
  sp: 5.5,
  don: 0,
};

// ─── Legends of Runeterra ─────────────────────────────────────────────────

const LOR_CORE: Record<RuneterraRarity, number> = {
  Common: 100,
  Rare: 0,
  Epic: 0,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_MID: Record<RuneterraRarity, number> = {
  Common: 70,
  Rare: 28,
  Epic: 2,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_UPPER: Record<RuneterraRarity, number> = {
  Common: 30,
  Rare: 65,
  Epic: 5,
  Champion: 0,
  Holographic: 0,
  Prismatic: 0,
  None: 0,
};

const LOR_HIGH: Record<RuneterraRarity, number> = {
  Common: 0,
  Rare: 65,
  Epic: 25,
  Champion: 8,
  Holographic: 2,
  Prismatic: 0,
  None: 0,
};

const LOR_RARE: Record<RuneterraRarity, number> = {
  Common: 0,
  Rare: 40,
  Epic: 30,
  Champion: 18,
  Holographic: 10,
  Prismatic: 2,
  None: 0,
};

// ─── Layout des slots par jeu ─────────────────────────────────────────────
// Doit refléter PACK_LAYOUT dans party/src/tcg.ts.
type Layout = { core: number; mid: number; upper: number };

const POKEMON_LAYOUT: Layout = { core: 4, mid: 3, upper: 1 };
const ONEPIECE_LAYOUT: Layout = { core: 4, mid: 3, upper: 1 };
const LOR_LAYOUT: Layout = { core: 7, mid: 4, upper: 2 };

// ─── Helpers ──────────────────────────────────────────────────────────────

function sumWeights<R extends string>(w: Record<R, number>): number {
  return Object.values(w).reduce<number>((s, v) => s + (v as number), 0);
}

function packRate<R extends string>(
  rarity: R,
  core: Record<R, number>,
  mid: Record<R, number>,
  upper: Record<R, number>,
  high: Record<R, number>,
  rare: Record<R, number>,
  layout: Layout,
): number {
  const coreSum = sumWeights(core);
  const midSum = sumWeights(mid);
  const upperSum = sumWeights(upper);
  const highSum = sumWeights(high);
  const rareSum = sumWeights(rare);
  const pCore = coreSum > 0 ? core[rarity] / coreSum : 0;
  const pMid = midSum > 0 ? mid[rarity] / midSum : 0;
  const pUpper = upperSum > 0 ? upper[rarity] / upperSum : 0;
  const pHigh = highSum > 0 ? high[rarity] / highSum : 0;
  const pRare = rareSum > 0 ? rare[rarity] / rareSum : 0;
  const probNone =
    Math.pow(1 - pCore, layout.core) *
    Math.pow(1 - pMid, layout.mid) *
    Math.pow(1 - pUpper, layout.upper) *
    (1 - pHigh) *
    (1 - pRare);
  return 1 - probNone;
}

/** Pack rate (0..1) d'une rareté Pokémon TCG dans un booster (10 cartes). */
export function pokemonPackRate(rarity: TcgRarity): number {
  return packRate(
    rarity,
    POKEMON_CORE,
    POKEMON_MID,
    POKEMON_UPPER,
    POKEMON_HIGH,
    POKEMON_RARE,
    POKEMON_LAYOUT,
  );
}

/** Pack rate (0..1) d'une rareté One Piece TCG dans un booster (10 cartes). */
export function onepiecePackRate(rarity: OnePieceRarity): number {
  return packRate(
    rarity,
    ONEPIECE_CORE,
    ONEPIECE_MID,
    ONEPIECE_UPPER,
    ONEPIECE_HIGH,
    ONEPIECE_RARE,
    ONEPIECE_LAYOUT,
  );
}

/** Pack rate (0..1) d'une rareté Runeterra dans un booster (15 cartes). */
export function runeterraPackRate(rarity: RuneterraRarity): number {
  return packRate(
    rarity,
    LOR_CORE,
    LOR_MID,
    LOR_UPPER,
    LOR_HIGH,
    LOR_RARE,
    LOR_LAYOUT,
  );
}

/** Format un pack rate (0..1) en chaîne « X% » avec max 2 décimales et
 *  sans virgule inutile (« 90% » plutôt que « 90.00% », « 1.25% » plutôt
 *  que « 1.25000% »). Pour les très petites valeurs (< 0.01%) affiche
 *  « < 0.01% » plutôt que « 0% » qui serait trompeur. */
export function formatPackRate(rate: number): string {
  const pct = rate * 100;
  if (pct > 0 && pct < 0.01) return "< 0.01%";
  if (Number.isInteger(pct)) return `${pct}%`;
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

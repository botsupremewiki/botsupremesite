// Probabilités d'apparition par rareté dans un booster, pour les 3 TCG.
// Utilisé côté client pour afficher « X% de chance par pack » sur l'écran
// détail booster.
//
// IMPORTANT — duplique les weights définis dans `party/src/tcg.ts` :
//   • REGULAR_LOW_WEIGHTS / OP_REGULAR_LOW_WEIGHTS / LOR_REGULAR_LOW_WEIGHTS
//   • REGULAR_HIGH_WEIGHTS / OP_REGULAR_HIGH_WEIGHTS / LOR_REGULAR_HIGH_WEIGHTS
//   • RARE_SLOT_WEIGHTS / OP_RARE_SLOT_WEIGHTS / LOR_RARE_SLOT_WEIGHTS
//
// Si tu changes les weights dans party/src/tcg.ts, mets aussi à jour ce
// fichier sinon le % affiché sera désynchronisé du vrai drop rate.
//
// Composition d'un pack (logique générique côté serveur) :
//   • (packSize - 2) slots "regular-low" indépendants
//   • 1 slot "regular-high"
//   • 1 slot "rare"
//
// Le pack rate d'une rareté X = P(au moins 1 X dans le pack)
//   = 1 - P(aucune X dans aucun slot)
//   = 1 - (1 - p_low(X))^(N-2) × (1 - p_high(X)) × (1 - p_rare(X))
// où p_slot(X) = weight_slot[X] / sum(weights_slot).

import type { OnePieceRarity, RuneterraRarity, TcgRarity } from "./types";

// ─── Pokémon TCG Pocket ───────────────────────────────────────────────────

const POKEMON_LOW: Record<TcgRarity, number> = {
  "diamond-1": 90,
  "diamond-2": 9,
  "diamond-3": 1,
  "diamond-4": 0,
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

const ONEPIECE_LOW: Record<OnePieceRarity, number> = {
  c: 80,
  uc: 18,
  r: 2,
  sr: 0,
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

const LOR_LOW: Record<RuneterraRarity, number> = {
  Common: 90,
  Rare: 9,
  Epic: 1,
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

// ─── Helpers ──────────────────────────────────────────────────────────────

function sumWeights<R extends string>(w: Record<R, number>): number {
  return Object.values(w).reduce<number>((s, v) => s + (v as number), 0);
}

function packRate<R extends string>(
  rarity: R,
  low: Record<R, number>,
  high: Record<R, number>,
  rare: Record<R, number>,
  packSize: number,
): number {
  const lowSum = sumWeights(low);
  const highSum = sumWeights(high);
  const rareSum = sumWeights(rare);
  const pLow = lowSum > 0 ? low[rarity] / lowSum : 0;
  const pHigh = highSum > 0 ? high[rarity] / highSum : 0;
  const pRare = rareSum > 0 ? rare[rarity] / rareSum : 0;
  const lowSlots = Math.max(0, packSize - 2);
  const probNone =
    Math.pow(1 - pLow, lowSlots) * (1 - pHigh) * (1 - pRare);
  return 1 - probNone;
}

/** Pack rate (0..1) d'une rareté Pokémon TCG dans un booster (10 cartes). */
export function pokemonPackRate(rarity: TcgRarity): number {
  return packRate(rarity, POKEMON_LOW, POKEMON_HIGH, POKEMON_RARE, 10);
}

/** Pack rate (0..1) d'une rareté One Piece TCG dans un booster (10 cartes). */
export function onepiecePackRate(rarity: OnePieceRarity): number {
  return packRate(rarity, ONEPIECE_LOW, ONEPIECE_HIGH, ONEPIECE_RARE, 10);
}

/** Pack rate (0..1) d'une rareté Runeterra dans un booster (10 cartes). */
export function runeterraPackRate(rarity: RuneterraRarity): number {
  return packRate(rarity, LOR_LOW, LOR_HIGH, LOR_RARE, 10);
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

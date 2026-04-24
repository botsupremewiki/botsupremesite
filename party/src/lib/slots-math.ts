import type { SlotsSymbol, SlotsWinKind } from "../../../shared/types";

// Reel composition. Each reel uses the same weighted distribution.
// Tuned for ≈ 96% RTP — see expectedRtp() below.
export const SLOTS_REEL: { symbol: SlotsSymbol; weight: number }[] = [
  { symbol: "cherry", weight: 8 },
  { symbol: "lemon", weight: 6 },
  { symbol: "orange", weight: 5 },
  { symbol: "grape", weight: 4 },
  { symbol: "bell", weight: 3 },
  { symbol: "clover", weight: 2 },
  { symbol: "seven", weight: 1 },
  { symbol: "diamond", weight: 1 },
];

// Three-of-a-kind paytable (multiplier on bet). Tuned for ≈ 96% RTP.
export const SLOTS_PAYOUT_3: Record<SlotsSymbol, number> = {
  cherry: 10,
  lemon: 11,
  orange: 16,
  grape: 30,
  bell: 55,
  clover: 180,
  seven: 500,
  diamond: 1600,
};

// Cherry-only consolation prizes (paid when not also a three-of-a-kind).
export const CHERRY_TWO_PAYOUT = 3; // exactly two cherries on the left
export const CHERRY_ONE_PAYOUT = 1; // a single cherry on reel 1 (refund)

const TOTAL_WEIGHT = SLOTS_REEL.reduce((s, r) => s + r.weight, 0);

export function spinReel(): SlotsSymbol {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const entry of SLOTS_REEL) {
    if (r < entry.weight) return entry.symbol;
    r -= entry.weight;
  }
  return SLOTS_REEL[SLOTS_REEL.length - 1].symbol;
}

export function evaluateSpin(reels: SlotsSymbol[]): {
  multiplier: number;
  kind: SlotsWinKind;
} {
  if (reels.length < 3) return { multiplier: 0, kind: "none" };
  const [a, b, c] = reels;

  if (a === b && b === c) {
    return { multiplier: SLOTS_PAYOUT_3[a], kind: "three" };
  }
  if (a === "cherry" && b === "cherry") {
    return { multiplier: CHERRY_TWO_PAYOUT, kind: "two-cherry" };
  }
  if (a === "cherry") {
    return { multiplier: CHERRY_ONE_PAYOUT, kind: "one-cherry" };
  }
  return { multiplier: 0, kind: "none" };
}

// Closed-form RTP — useful for tuning. Not called at runtime.
export function expectedRtp(): number {
  const W = TOTAL_WEIGHT;
  const total = W * W * W;
  let sum = 0;

  // 3-of-a-kind
  for (const { symbol, weight } of SLOTS_REEL) {
    sum += weight * weight * weight * SLOTS_PAYOUT_3[symbol];
  }

  const cherryWeight = SLOTS_REEL.find((s) => s.symbol === "cherry")!.weight;
  const nonCherry = W - cherryWeight;

  // Exactly first 2 cherries (3rd ≠ cherry)
  sum += cherryWeight * cherryWeight * nonCherry * CHERRY_TWO_PAYOUT;

  // Only first cherry (2nd ≠ cherry, 3rd = anything)
  sum += cherryWeight * nonCherry * W * CHERRY_ONE_PAYOUT;

  return sum / total;
}

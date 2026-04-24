/**
 * Payout multiplier for a Mines game.
 * Standard formula: rtp * product over i=0..k-1 of (N - i) / (N - M - i)
 * where N = total tiles, M = mines, k = safe tiles revealed.
 */
export function minesMultiplier(
  totalTiles: number,
  minesCount: number,
  safeRevealed: number,
  rtp = 0.97,
): number {
  if (safeRevealed <= 0) return 0;
  const safeTotal = totalTiles - minesCount;
  if (safeTotal <= 0) return 0;
  if (safeRevealed > safeTotal) return 0;
  let mul = rtp;
  for (let i = 0; i < safeRevealed; i++) {
    mul *= (totalTiles - i) / (safeTotal - i);
  }
  return mul;
}

export function pickMinesCount(
  totalTiles: number,
  minFraction: number,
  maxFraction: number,
): number {
  const lo = Math.max(1, Math.floor(totalTiles * minFraction));
  const hi = Math.max(lo, Math.floor(totalTiles * maxFraction));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function pickMinePositions(
  totalTiles: number,
  minesCount: number,
): Set<number> {
  const positions = new Set<number>();
  while (positions.size < minesCount) {
    positions.add(Math.floor(Math.random() * totalTiles));
  }
  return positions;
}

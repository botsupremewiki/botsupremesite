import { MINES_CONFIG } from "../../../shared/types";

/**
 * Payout multiplier for a Mines game.
 * Standard formula: rtp * product over i=0..k-1 of (N - i) / (N - M - i)
 * where N = total tiles, M = mines, k = safe tiles revealed.
 */
export function minesMultiplier(
  totalTiles: number,
  minesCount: number,
  safeRevealed: number,
  rtp: number,
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

/**
 * Linear RTP interpolation between rtpAtMin (at minMines) and rtpAtMax (at
 * maxMines). With current config that's 90% with a single mine (long
 * grindy game) up to 95% with 24 mines (effectively a 1-in-25 lottery).
 */
export function rtpForMines(minesCount: number): number {
  const { minMines, maxMines, rtpAtMin, rtpAtMax } = MINES_CONFIG;
  if (maxMines === minMines) return rtpAtMin;
  const t = (minesCount - minMines) / (maxMines - minMines);
  const clamped = Math.max(0, Math.min(1, t));
  return rtpAtMin + (rtpAtMax - rtpAtMin) * clamped;
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

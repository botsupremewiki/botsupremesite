import type {
  SlotMachineConfig,
  SlotsSymbolKey,
  SlotsWinKind,
} from "../../../shared/types";

export function totalWeight(config: SlotMachineConfig): number {
  return config.weights.reduce((s, w) => s + w, 0);
}

export function spinReel(config: SlotMachineConfig): SlotsSymbolKey {
  const W = totalWeight(config);
  let r = Math.random() * W;
  for (let i = 0; i < config.weights.length; i++) {
    if (r < config.weights[i]) return config.symbols[i].key;
    r -= config.weights[i];
  }
  return config.symbols[config.symbols.length - 1].key;
}

export function evaluateSpin(
  reels: SlotsSymbolKey[],
  config: SlotMachineConfig,
): { multiplier: number; kind: SlotsWinKind } {
  if (reels.length < 3) return { multiplier: 0, kind: "none" };
  const [a, b, c] = reels;
  if (a === b && b === c) {
    const idx = config.symbols.findIndex((s) => s.key === a);
    return { multiplier: config.payouts3[idx] ?? 0, kind: "three" };
  }
  const cherry = config.symbols[0].key;
  if (a === cherry && b === cherry) {
    return { multiplier: config.cherryTwo, kind: "two-cherry" };
  }
  if (a === cherry) {
    return { multiplier: config.cherryOne, kind: "one-cherry" };
  }
  return { multiplier: 0, kind: "none" };
}

/**
 * Closed-form expected return per unit bet for the given config. Useful
 * for tuning paytables and for the in-game "RTP info" tooltip.
 */
export function expectedRtp(config: SlotMachineConfig): number {
  const W = totalWeight(config);
  const total = W * W * W;
  let sum = 0;
  for (let i = 0; i < config.symbols.length; i++) {
    const w = config.weights[i];
    sum += w * w * w * config.payouts3[i];
  }
  const cherryWeight = config.weights[0];
  const nonCherry = W - cherryWeight;
  // exactly first 2 cherries (3rd ≠ cherry)
  sum += cherryWeight * cherryWeight * nonCherry * config.cherryTwo;
  // only first cherry (2nd ≠ cherry, 3rd = anything)
  sum += cherryWeight * nonCherry * W * config.cherryOne;
  return sum / total;
}

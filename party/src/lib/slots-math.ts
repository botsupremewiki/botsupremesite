import type {
  SlotMachineConfig,
  SlotsSymbolKey,
  SlotsWinLine,
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

/**
 * Generate the full visible grid: cols × rows of independently drawn
 * symbols. Returned in column-major order so the client can animate
 * each reel as a vertical strip.
 */
export function spinGrid(config: SlotMachineConfig): SlotsSymbolKey[][] {
  const grid: SlotsSymbolKey[][] = [];
  for (let c = 0; c < config.cols; c++) {
    const col: SlotsSymbolKey[] = [];
    for (let r = 0; r < config.rows; r++) col.push(spinReel(config));
    grid.push(col);
  }
  return grid;
}

/**
 * Walk a payline left-to-right, count matching symbols from the leftmost
 * reel, and return the matched symbol + length. Cherry-bonus matches
 * (lengths 1 or 2) are reported with the cherry symbol.
 */
function evaluateLine(
  grid: SlotsSymbolKey[][],
  payline: number[],
  config: SlotMachineConfig,
): { symbol: SlotsSymbolKey; length: number } | null {
  if (payline.length !== config.cols) return null;
  const first = grid[0][payline[0]];
  let length = 1;
  for (let c = 1; c < config.cols; c++) {
    if (grid[c][payline[c]] === first) length++;
    else break;
  }
  return { symbol: first, length };
}

/**
 * Evaluate every payline. Returns:
 *  - winLines: per-line wins for highlight rendering (multiplier is per
 *    *line* — caller must divide bet by paylines.length to get the
 *    actual OS payout for that line).
 *  - totalMultiplier: sum of per-line multipliers / paylines.length, i.e.
 *    the multiplier applied to the player's whole bet.
 */
export function evaluateGrid(
  grid: SlotsSymbolKey[][],
  config: SlotMachineConfig,
): { lines: SlotsWinLine[]; totalMultiplier: number } {
  const cherry = config.symbols[0].key;
  const lines: SlotsWinLine[] = [];
  let perLineSum = 0;
  for (let i = 0; i < config.paylines.length; i++) {
    const result = evaluateLine(grid, config.paylines[i], config);
    if (!result) continue;
    const { symbol, length } = result;
    let payout = 0;
    if (length >= 3) {
      const idx = config.symbols.findIndex((s) => s.key === symbol);
      const base = config.payouts3[idx] ?? 0;
      if (length === 3) payout = base;
      else if (length === 4) payout = base * config.match4Multiplier;
      else payout = base * config.match5Multiplier;
    } else if (length === 2 && symbol === cherry) {
      payout = config.cherryTwo;
    } else if (length === 1 && symbol === cherry) {
      payout = config.cherryOne;
    }
    if (payout > 0) {
      lines.push({
        paylineIndex: i,
        symbol,
        matchLength: length,
        payout,
      });
      perLineSum += payout;
    }
  }
  const totalMultiplier = perLineSum / config.paylines.length;
  return { lines, totalMultiplier };
}

/**
 * Closed-form RTP per spin. Each payline draws `cols` independent
 * symbols, so all paylines have the same RTP, and the player's total
 * RTP equals that single per-line RTP (we divide the bet evenly across
 * paylines). Useful for tuning paytables.
 */
export function expectedRtp(config: SlotMachineConfig): number {
  const W = totalWeight(config);
  const cherryWeight = config.weights[0];
  const cherryProb = cherryWeight / W;
  let perLine = 0;

  // Cherry bonuses on the leftmost reel (independent of payline shape).
  perLine += cherryProb * (1 - cherryProb) * config.cherryOne;
  perLine += cherryProb * cherryProb * (1 - cherryProb) * config.cherryTwo;

  // 3+ matching streaks for every symbol.
  for (let i = 0; i < config.symbols.length; i++) {
    const p = config.weights[i] / W;
    const pay3 = config.payouts3[i];
    const pay4 = pay3 * config.match4Multiplier;
    const pay5 = pay3 * config.match5Multiplier;
    if (config.cols === 3) {
      perLine += p ** 3 * pay3;
    } else if (config.cols === 4) {
      perLine += p ** 3 * (1 - p) * pay3;
      perLine += p ** 4 * pay4;
    } else if (config.cols === 5) {
      perLine += p ** 3 * (1 - p) * pay3;
      perLine += p ** 4 * (1 - p) * pay4;
      perLine += p ** 5 * pay5;
    }
  }
  return perLine;
}

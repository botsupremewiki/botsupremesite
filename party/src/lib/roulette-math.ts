// European roulette — single zero, 37 pockets, house edge 2.7%.

export const RED_NUMBERS = new Set<number>([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set<number>([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

// European wheel order, clockwise starting at 0.
export const WHEEL_ORDER: number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export function colorOf(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export function pickWinningNumber(): number {
  return Math.floor(Math.random() * 37);
}

export function pocketIndex(n: number): number {
  return WHEEL_ORDER.indexOf(n);
}

/**
 * Returns the payout multiplier for a winning bet, including the original
 * stake. 0 if the bet loses.
 * - Straight up (single number): 36 (35:1 + stake)
 * - Red / Black / Even / Odd / Low / High: 2 (1:1 + stake)
 * - Dozens / Columns: 3 (2:1 + stake)
 */
export function betMultiplier(betKey: string, winning: number): number {
  if (betKey.startsWith("straight-")) {
    const n = parseInt(betKey.slice("straight-".length), 10);
    if (!Number.isFinite(n)) return 0;
    return n === winning ? 36 : 0;
  }
  switch (betKey) {
    case "red":
      return RED_NUMBERS.has(winning) ? 2 : 0;
    case "black":
      return BLACK_NUMBERS.has(winning) ? 2 : 0;
    case "even":
      return winning !== 0 && winning % 2 === 0 ? 2 : 0;
    case "odd":
      return winning !== 0 && winning % 2 === 1 ? 2 : 0;
    case "low":
      return winning >= 1 && winning <= 18 ? 2 : 0;
    case "high":
      return winning >= 19 && winning <= 36 ? 2 : 0;
    case "dozen1":
      return winning >= 1 && winning <= 12 ? 3 : 0;
    case "dozen2":
      return winning >= 13 && winning <= 24 ? 3 : 0;
    case "dozen3":
      return winning >= 25 && winning <= 36 ? 3 : 0;
    case "column1":
      return winning !== 0 && winning % 3 === 1 ? 3 : 0;
    case "column2":
      return winning !== 0 && winning % 3 === 2 ? 3 : 0;
    case "column3":
      return winning !== 0 && winning % 3 === 0 ? 3 : 0;
    default:
      return 0;
  }
}

export function isValidBetKey(betKey: string): boolean {
  if (betKey.startsWith("straight-")) {
    const n = parseInt(betKey.slice("straight-".length), 10);
    return Number.isInteger(n) && n >= 0 && n <= 36;
  }
  return [
    "red",
    "black",
    "even",
    "odd",
    "low",
    "high",
    "dozen1",
    "dozen2",
    "dozen3",
    "column1",
    "column2",
    "column3",
  ].includes(betKey);
}

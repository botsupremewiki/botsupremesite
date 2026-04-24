import type {
  Card,
  CardRank,
  CardSuit,
  HiLoGuess,
} from "../../../shared/types";

const RANKS: CardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const SUITS: CardSuit[] = ["S", "H", "D", "C"];

const N_RANKS = RANKS.length;

export function drawCard(): Card {
  return {
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
  };
}

/**
 * Numeric value of a card given the locked aceValue. If the card is an
 * ace and aceValue is null (joker not yet picked), returns null.
 */
export function cardValue(
  card: Card,
  aceValue: 1 | 14 | null,
): number | null {
  if (card.rank === "A") return aceValue;
  if (card.rank === "J") return 11;
  if (card.rank === "Q") return 12;
  if (card.rank === "K") return 13;
  return parseInt(card.rank, 10);
}

/**
 * Probability the player's `guess` wins on the next draw, given the
 * current card and (possibly null) aceValue. When aceValue is null we
 * assume the player will pick optimally if the next card is the joker —
 * so for "higher" the joker counts as 14 and for "lower" as 1. This is
 * what keeps RTP at the configured target instead of leaking edge to
 * the player via the joker.
 */
export function probWin(
  guess: HiLoGuess,
  current: Card,
  aceValue: 1 | 14 | null,
): number {
  if (guess === "same") return 1 / N_RANKS;

  if (aceValue !== null) {
    const v = cardValue(current, aceValue);
    if (v === null) return 0; // shouldn't happen if aceValue is set
    if (aceValue === 14) {
      if (guess === "higher") return Math.max(0, 14 - v) / N_RANKS;
      return Math.max(0, v - 2) / N_RANKS;
    }
    // aceValue === 1
    if (guess === "higher") return Math.max(0, 13 - v) / N_RANKS;
    return Math.max(0, v - 1) / N_RANKS;
  }

  // Joker still available — current must be a non-ace card here.
  const v = cardValue(current, 1);
  if (v === null) return 0;
  if (guess === "higher") {
    // non-ace ranks above v: (13 - v); plus the ace counted optimally as 14.
    return (13 - v + 1) / N_RANKS;
  }
  // lower: non-ace ranks below v: (v - 2); plus the ace counted as 1.
  return (v - 2 + 1) / N_RANKS;
}

export function payoutMultiplier(
  guess: HiLoGuess,
  current: Card,
  aceValue: 1 | 14 | null,
  rtp: number,
): number {
  const p = probWin(guess, current, aceValue);
  if (p <= 0) return 0;
  return rtp / p;
}

/**
 * Decide if a guess was correct after the next card is revealed. When
 * the next card is an ace, aceValue must already be set (server prompts
 * the player first).
 */
export function evaluateGuess(
  guess: HiLoGuess,
  current: Card,
  next: Card,
  aceValue: 1 | 14 | null,
): boolean {
  if (guess === "same") return next.rank === current.rank;
  const a = cardValue(current, aceValue);
  const b = cardValue(next, aceValue);
  if (a === null || b === null) return false;
  if (guess === "higher") return b > a;
  return b < a;
}

/**
 * Helper used to refuse a guess whose payout would be zero (impossible
 * win — e.g. "higher" on a King when aces are locked low).
 */
export function isGuessAvailable(
  guess: HiLoGuess,
  current: Card,
  aceValue: 1 | 14 | null,
): boolean {
  return probWin(guess, current, aceValue) > 0;
}

import type {
  Card,
  CardRank,
  CardSuit,
  PokerShowdownHand,
} from "../../../shared/types";

// Hand rank tiers, ordered low → high.
const TIER_HIGH_CARD = 1;
const TIER_PAIR = 2;
const TIER_TWO_PAIR = 3;
const TIER_THREE_KIND = 4;
const TIER_STRAIGHT = 5;
const TIER_FLUSH = 6;
const TIER_FULL_HOUSE = 7;
const TIER_FOUR_KIND = 8;
const TIER_STRAIGHT_FLUSH = 9;

const TIER_NAMES_FR: Record<number, string> = {
  [TIER_HIGH_CARD]: "Carte haute",
  [TIER_PAIR]: "Paire",
  [TIER_TWO_PAIR]: "Deux paires",
  [TIER_THREE_KIND]: "Brelan",
  [TIER_STRAIGHT]: "Suite",
  [TIER_FLUSH]: "Couleur",
  [TIER_FULL_HOUSE]: "Full",
  [TIER_FOUR_KIND]: "Carré",
  [TIER_STRAIGHT_FLUSH]: "Quinte flush",
};

export function rankValue(rank: CardRank): number {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return parseInt(rank, 10);
}

const SUITS: CardSuit[] = ["S", "H", "D", "C"];
const RANKS: CardRank[] = [
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
  "A",
];

export function makeShuffledDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) cards.push({ suit, rank });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Score a 5-card hand into a single comparable integer. Higher = better.
 *
 * Encoding: tier * 10^10 + r1 * 10^8 + r2 * 10^6 + r3 * 10^4 + r4 * 10^2 + r5,
 * where r1..r5 are the meaningful ranks for that tier (e.g. for two-pair:
 * high pair, low pair, kicker, 0, 0).
 */
function score5(cards: Card[]): { score: number; cards: Card[] } {
  const ranks = cards.map((c) => rankValue(c.rank));
  const sortedDesc = [...ranks].sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Group by count desc, then rank desc.
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const isStraight = checkStraight(sortedDesc);
  const straightHigh = isStraight ? straightTopCard(sortedDesc) : 0;

  let tier: number;
  let kickers: number[];
  if (isStraight && isFlush) {
    tier = TIER_STRAIGHT_FLUSH;
    kickers = [straightHigh, 0, 0, 0, 0];
  } else if (groups[0][1] === 4) {
    tier = TIER_FOUR_KIND;
    kickers = [groups[0][0], groups[1][0], 0, 0, 0];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    tier = TIER_FULL_HOUSE;
    kickers = [groups[0][0], groups[1][0], 0, 0, 0];
  } else if (isFlush) {
    tier = TIER_FLUSH;
    kickers = [...sortedDesc];
  } else if (isStraight) {
    tier = TIER_STRAIGHT;
    kickers = [straightHigh, 0, 0, 0, 0];
  } else if (groups[0][1] === 3) {
    tier = TIER_THREE_KIND;
    const others = sortedDesc.filter((r) => r !== groups[0][0]).slice(0, 2);
    kickers = [groups[0][0], ...others, 0, 0];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    tier = TIER_TWO_PAIR;
    const kicker = sortedDesc.find(
      (r) => r !== groups[0][0] && r !== groups[1][0],
    );
    kickers = [groups[0][0], groups[1][0], kicker ?? 0, 0, 0];
  } else if (groups[0][1] === 2) {
    tier = TIER_PAIR;
    const others = sortedDesc.filter((r) => r !== groups[0][0]).slice(0, 3);
    kickers = [groups[0][0], ...others, 0];
  } else {
    tier = TIER_HIGH_CARD;
    kickers = [...sortedDesc];
  }

  while (kickers.length < 5) kickers.push(0);
  const score =
    tier * 1e10 +
    kickers[0] * 1e8 +
    kickers[1] * 1e6 +
    kickers[2] * 1e4 +
    kickers[3] * 1e2 +
    kickers[4];
  return { score, cards };
}

function checkStraight(sortedDesc: number[]): boolean {
  // Distinct ranks only — sortedDesc may have dups (it shouldn't for 5
  // cards used here, but be defensive).
  const unique = Array.from(new Set(sortedDesc));
  if (unique.length < 5) return false;
  // Standard 5-in-a-row.
  for (let i = 0; i + 4 < unique.length; i++) {
    if (unique[i] - unique[i + 4] === 4) return true;
  }
  // Wheel straight: A-2-3-4-5.
  if (
    unique.includes(14) &&
    unique.includes(2) &&
    unique.includes(3) &&
    unique.includes(4) &&
    unique.includes(5)
  ) {
    return true;
  }
  return false;
}

function straightTopCard(sortedDesc: number[]): number {
  const unique = Array.from(new Set(sortedDesc));
  for (let i = 0; i + 4 < unique.length; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  // Wheel: top is 5.
  if (
    unique.includes(14) &&
    unique.includes(2) &&
    unique.includes(3) &&
    unique.includes(4) &&
    unique.includes(5)
  ) {
    return 5;
  }
  return 0;
}

// All C(7, 5) = 21 combinations.
function combinations5of7<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  const n = arr.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            out.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
  return out;
}

/**
 * Evaluate the best 5-card hand from the given 7 cards (player's 2 +
 * 5 community). Returns the score, the 5 best cards, and a French
 * label.
 */
export function bestOf7(cards: Card[]): PokerShowdownHand {
  if (cards.length < 5) {
    return { cards: [...cards], rankName: "—", score: 0 };
  }
  const combos = cards.length === 7 ? combinations5of7(cards) : [cards];
  let best: { score: number; cards: Card[] } | null = null;
  for (const combo of combos) {
    const r = score5(combo);
    if (!best || r.score > best.score) best = r;
  }
  if (!best) return { cards: [...cards].slice(0, 5), rankName: "—", score: 0 };
  const tier = Math.floor(best.score / 1e10);
  return {
    cards: best.cards,
    rankName: TIER_NAMES_FR[tier] ?? "—",
    score: best.score,
  };
}

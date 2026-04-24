export type Direction = "up" | "down" | "left" | "right";

export type Player = {
  id: string;
  authId?: string;
  name: string;
  avatarUrl?: string;
  x: number;
  y: number;
  direction: Direction;
  color: string;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  isAdmin?: boolean;
};

export type ClientMessage =
  | { type: "move"; x: number; y: number; direction: Direction }
  | { type: "set-name"; name: string }
  | { type: "chat"; text: string }
  | { type: "take-seat"; seatIndex: number }
  | { type: "leave-seat" }
  | { type: "ready" }
  | { type: "bet"; amount: number }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "split" }
  | { type: "insurance"; take: boolean };

export type CardSuit = "S" | "H" | "D" | "C";
export type CardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export type Card = {
  suit: CardSuit;
  rank: CardRank;
};

export type BlackjackPhase =
  | "idle"
  | "betting"
  | "insurance"
  | "playing"
  | "dealer"
  | "resolving";

export type BlackjackSeatStatus =
  | "empty"
  | "waiting"
  | "ready"
  | "betting"
  | "playing"
  | "settled";

export type BlackjackHandStatus =
  | "playing"
  | "stood"
  | "busted"
  | "blackjack"
  | "won"
  | "lost"
  | "pushed";

export type BlackjackHand = {
  cards: Card[];
  score: number;
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  status: BlackjackHandStatus;
};

export type BlackjackSeat = {
  seatIndex: number;
  playerId: string | null;
  playerName: string | null;
  playerColor: string | null;
  gold: number;
  baseBet: number; // bet placed during betting phase
  insuranceBet: number; // 0 unless taken when dealer shows ace
  hands: BlackjackHand[];
  activeHandIndex: number; // index inside hands[] currently being played
  status: BlackjackSeatStatus;
  ready: boolean;
};

export type BlackjackState = {
  phase: BlackjackPhase;
  seats: BlackjackSeat[];
  activeSeatIndex: number | null;
  dealerHand: Card[];
  dealerScore: number;
  dealerHoleHidden: boolean;
  phaseEndsAt: number | null;
  lastOutcome?: string | null;
};

export type ServerMessage =
  | {
      type: "welcome";
      selfId: string;
      players: Player[];
      chat: ChatMessage[];
      blackjack?: BlackjackState;
      gold?: number;
    }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | {
      type: "player-moved";
      playerId: string;
      x: number;
      y: number;
      direction: Direction;
    }
  | { type: "player-renamed"; playerId: string; name: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "blackjack-state"; state: BlackjackState }
  | { type: "gold-update"; gold: number }
  | { type: "error"; message: string };

// Direct messages (one-to-one chat)
export type DmMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  senderName?: string;
  recipientName?: string;
  content: string;
  createdAt: number;
};

export type DmConversation = {
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl?: string;
  lastMessage: DmMessage;
  unreadCount: number;
};

export type DmClientMessage =
  | { type: "send"; recipientId: string; text: string }
  | { type: "load-thread"; partnerId: string }
  | { type: "mark-read"; partnerId: string }
  | { type: "lookup-user"; query: string };

export type DmServerMessage =
  | {
      type: "dm-welcome";
      conversations: DmConversation[];
    }
  | { type: "dm-incoming"; message: DmMessage }
  | { type: "dm-sent"; message: DmMessage }
  | {
      type: "dm-thread";
      partnerId: string;
      messages: DmMessage[];
    }
  | {
      type: "dm-user-lookup";
      query: string;
      results: { id: string; username: string; avatarUrl?: string }[];
    }
  | { type: "dm-error"; message: string };

export const PLAZA_CONFIG = {
  width: 1024,
  height: 640,
  maxPlayers: 30,
  moveSpeed: 2.5,
  chatHistorySize: 30,
} as const;

export const BLACKJACK_CONFIG = {
  seatCount: 5,
  minBet: 10,
  maxBet: 10_000_000,
  bettingDurationMs: 20_000,
  turnDurationMs: 15_000,
  roundIntervalMs: 3_000,
} as const;

// ────────────────────────────── Mines ──────────────────────────────

export const MINES_CONFIG = {
  minSize: 3,
  maxSize: 10,
  minBet: 10,
  maxBet: 10_000_000,
  rtp: 0.97,
} as const;

// ────────────────────────────── Roulette ──────────────────────────────

export const ROULETTE_CONFIG = {
  seatCount: 6,
  minBet: 10,
  maxBet: 10_000_000,
  bettingDurationMs: 20_000,
  spinDurationMs: 4_000,
  resolveDurationMs: 4_000,
  recentNumbersKept: 10,
} as const;

export type RouletteBetKey =
  | `straight-${number}`
  | "red"
  | "black"
  | "even"
  | "odd"
  | "low"
  | "high"
  | "dozen1"
  | "dozen2"
  | "dozen3"
  | "column1"
  | "column2"
  | "column3";

export type RoulettePhase = "idle" | "betting" | "spinning" | "resolving";

export type RouletteSeatStatus =
  | "empty"
  | "waiting"
  | "ready"
  | "won"
  | "lost"
  | "pushed";

export type RouletteSeat = {
  seatIndex: number;
  playerId: string | null;
  playerName: string | null;
  playerColor: string | null;
  gold: number;
  bets: Record<string, number>; // RouletteBetKey → stake
  totalBet: number;
  lastDelta: number; // net change in last round (-total bet if lost, +payout if won)
  status: RouletteSeatStatus;
  ready: boolean;
};

export type RouletteState = {
  phase: RoulettePhase;
  seats: RouletteSeat[];
  winningNumber: number | null;
  recentNumbers: number[];
  phaseEndsAt: number | null;
  lastOutcome: string | null;
  numberCounts: Record<string, number>; // "0".."36" → total spins landed on that number
  totalSpins: number;
};

export type RouletteClientMessage =
  | { type: "take-seat"; seatIndex: number }
  | { type: "leave-seat" }
  | { type: "ready" }
  | { type: "place-bet"; betKey: string; amount: number }
  | { type: "clear-bets" }
  | { type: "hit" } // unused placeholder kept for typed clients
  | { type: "stand" }; // unused placeholder kept for typed clients

export type RouletteServerMessage =
  | {
      type: "roulette-welcome";
      selfId: string;
      players: Player[];
      chat: ChatMessage[];
      state: RouletteState;
      gold: number;
    }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | {
      type: "player-moved";
      playerId: string;
      x: number;
      y: number;
      direction: Direction;
    }
  | { type: "player-renamed"; playerId: string; name: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "roulette-state"; state: RouletteState }
  | { type: "gold-update"; gold: number }
  | { type: "roulette-error"; message: string };

export type MinesStatus =
  | "idle"
  | "playing"
  | "busted"
  | "cashed";

export type MinesTile = "hidden" | "safe" | "mine";

export type MinesGameState = {
  gridRows: number;
  gridCols: number;
  minesCount: number;
  bet: number;
  revealedCount: number;
  multiplier: number;
  potentialPayout: number;
  nextMultiplier: number;
  status: MinesStatus;
  tiles: MinesTile[]; // row-major
  // Only present when game ended (busted or cashed):
  minesMap?: number[]; // indices where mines were
};

export type MinesClientMessage =
  | {
      type: "mines-start";
      rows: number;
      cols: number;
      minesCount: number;
      bet: number;
    }
  | { type: "mines-reveal"; index: number }
  | { type: "mines-cash-out" };

export type MinesServerMessage =
  | {
      type: "mines-welcome";
      selfId: string;
      gold: number;
      game: MinesGameState | null;
      chat: ChatMessage[];
    }
  | { type: "mines-state"; game: MinesGameState }
  | { type: "gold-update"; gold: number }
  | { type: "mines-error"; message: string }
  | { type: "chat"; message: ChatMessage };

// ────────────────────────────── Slots ──────────────────────────────

export const SLOTS_CONFIG = {
  reelCount: 3,
  minBet: 10,
  maxBet: 10_000_000,
  spinDurationMs: 1800, // total time until last reel locks
  reelStaggerMs: 350, // delay between each reel locking
  historySize: 8,
} as const;

export type SlotsSymbol =
  | "cherry"
  | "lemon"
  | "orange"
  | "grape"
  | "bell"
  | "clover"
  | "seven"
  | "diamond";

export type SlotsWinKind =
  | "none"
  | "three" // three-of-a-kind on the payline
  | "two-cherry" // exactly two cherries from the left
  | "one-cherry"; // a single cherry on the leftmost reel

export type SlotsSpin = {
  id: string;
  reels: SlotsSymbol[]; // length = SLOTS_CONFIG.reelCount
  bet: number;
  win: number; // total OS won (0 if lose)
  multiplier: number; // payout multiplier applied to bet (0 if lose)
  kind: SlotsWinKind;
  timestamp: number;
};

export type SlotsClientMessage = { type: "slots-spin"; bet: number };

export type SlotsServerMessage =
  | {
      type: "slots-welcome";
      selfId: string;
      gold: number;
      history: SlotsSpin[];
      chat: ChatMessage[];
    }
  | { type: "slots-result"; spin: SlotsSpin }
  | { type: "gold-update"; gold: number }
  | { type: "slots-error"; message: string }
  | { type: "chat"; message: ChatMessage };

// ────────────────────────────── Hi-Lo ──────────────────────────────

export const HILO_CONFIG = {
  minBet: 10,
  maxBet: 10_000_000,
  rtp: 0.97,
  historySize: 8,
} as const;

export type HiLoGuess = "higher" | "lower" | "same";

export type HiLoStatus =
  | "idle"
  | "playing"
  | "awaiting-ace"
  | "busted"
  | "cashed";

export type HiLoState = {
  status: HiLoStatus;
  bet: number;
  multiplier: number; // current cashable multiplier (0 if busted/idle)
  history: Card[]; // dealt cards in order; last is current
  aceValue: 1 | 14 | null;
  // Pre-computed payout multipliers for each guess on the current card,
  // factoring in the joker if aceValue is still null. 0 means impossible.
  payouts: { higher: number; lower: number; same: number };
};

export type HiLoRound = {
  id: string;
  bet: number;
  outcome: "cashed" | "busted";
  payout: number; // total OS returned (0 if busted)
  steps: number; // correct guesses before ending
  endingMultiplier: number;
  aceValue: 1 | 14 | null;
  cards: Card[];
  timestamp: number;
};

export type HiLoClientMessage =
  | { type: "hilo-start"; bet: number }
  | { type: "hilo-guess"; guess: HiLoGuess }
  | { type: "hilo-set-ace"; value: 1 | 14 }
  | { type: "hilo-cash-out" };

export type HiLoServerMessage =
  | {
      type: "hilo-welcome";
      selfId: string;
      gold: number;
      history: HiLoRound[];
      chat: ChatMessage[];
    }
  | { type: "hilo-state"; state: HiLoState | null }
  | { type: "hilo-round-end"; round: HiLoRound }
  | { type: "gold-update"; gold: number }
  | { type: "hilo-error"; message: string }
  | { type: "chat"; message: ChatMessage };

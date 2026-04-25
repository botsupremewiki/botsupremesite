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
  spinDurationMs: 1800, // manual spin: total time until last reel locks
  reelStaggerMs: 320, // delay between each reel locking
  autoSpinDurationMs: 900, // faster animation when autospinning
  autoSpinReelStaggerMs: 160,
  autoSpinIntervalMs: 1100, // delay between consecutive autospins
  autoSpinChoices: [10, 25, 50, 100] as const,
  historySize: 8,
} as const;

export type SlotsSymbolKey =
  | "s0"
  | "s1"
  | "s2"
  | "s3"
  | "s4"
  | "s5"
  | "s6"
  | "s7";

export const SLOT_SYMBOL_KEYS: SlotsSymbolKey[] = [
  "s0",
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
];

export type SlotMachineId =
  | "verger-dore"
  | "tresor-pirates"
  | "pharaon-mystique"
  | "foret-enchantee"
  | "inferno-galactique";

export type SlotMachineConfig = {
  id: SlotMachineId;
  name: string;
  tagline: string;
  // Tailwind-style CSS classes used by the client to theme the cabinet.
  theme: {
    accent: string;
    glow: string;
    gradient: string;
    border: string;
  };
  // 8 symbols low → high tier. The first one is the "cherry" bonus
  // symbol (1- and 2-leftmost mini-payouts on each payline).
  symbols: { key: SlotsSymbolKey; glyph: string; label: string }[];
  weights: number[];
  // 3-of-a-kind base payout per symbol (paid per winning line).
  payouts3: number[];
  // Multiplier on payouts3 for 4- and 5-of-a-kind (only applies on
  // 5-reel grids — ignored on 3-reel grids).
  match4Multiplier: number;
  match5Multiplier: number;
  // Cherry bonus payouts on the leftmost reel of any payline.
  cherryTwo: number;
  cherryOne: number;
  // Grid shape & active paylines.
  cols: number;
  rows: number;
  // Each payline is an array of row indices, length = cols. The line
  // walks left-to-right; matches count from the leftmost reel.
  paylines: number[][];
  // Informational target RTP.
  targetRtp: number;
};

export type SlotsWinLine = {
  paylineIndex: number; // index into config.paylines
  symbol: SlotsSymbolKey;
  matchLength: number; // 3, 4 or 5 (cherry bonuses use 1 or 2)
  payout: number; // multiplier applied to per-line bet (= bet / paylines.length)
};

export type SlotsSpin = {
  id: string;
  // Grid in column-major order: grid[col][row] = symbol on reel `col` row `row`.
  // Length = config.cols, each inner array length = config.rows.
  grid: SlotsSymbolKey[][];
  bet: number;
  win: number;
  multiplier: number; // total payout / bet (sum of all winning lines)
  lines: SlotsWinLine[]; // for highlighting on the client
  timestamp: number;
};

export type SlotsAutospinState = {
  remaining: number;
  total: number;
  bet: number;
  stopOnBigWin: boolean; // stop if win >= 25× bet
};

export type SlotsClientMessage =
  | { type: "slots-spin"; bet: number }
  | { type: "slots-autospin-start"; bet: number; count: number; stopOnBigWin: boolean }
  | { type: "slots-autospin-stop" };

export type SlotsServerMessage =
  | {
      type: "slots-welcome";
      selfId: string;
      gold: number;
      history: SlotsSpin[];
      chat: ChatMessage[];
      machine: SlotMachineConfig;
      autospin: SlotsAutospinState | null;
    }
  | { type: "slots-result"; spin: SlotsSpin; autospin: SlotsAutospinState | null }
  | { type: "slots-autospin-state"; autospin: SlotsAutospinState | null }
  | { type: "gold-update"; gold: number }
  | { type: "slots-error"; message: string }
  | { type: "chat"; message: ChatMessage };

// ─── Reusable payline geometries ───────────────────────────────────────────
// Each array is a payline: row index per reel, length = cols.

const PL_3x1_SINGLE: number[][] = [[0, 0, 0]];
const PL_3x3_ROWS: number[][] = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
];
const PL_3x3_FIVE: number[][] = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];
const PL_5x3_NINE: number[][] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

// ─── 5 machine configs ─────────────────────────────────────────────────────

export const SLOT_MACHINES: Record<SlotMachineId, SlotMachineConfig> = {
  // 1. Frequent small wins, modest jackpot — ≈ 96.5% RTP, max ×500
  "verger-dore": {
    id: "verger-dore",
    name: "Verger Doré",
    tagline: "Fruits sucrés, gains réguliers",
    theme: {
      accent: "text-amber-300",
      glow: "shadow-[0_0_40px_rgba(251,191,36,0.45)]",
      gradient:
        "bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.15),transparent_60%)]",
      border: "border-amber-400/40",
    },
    symbols: [
      { key: "s0", glyph: "🍓", label: "Fraise" },
      { key: "s1", glyph: "🍋", label: "Citron" },
      { key: "s2", glyph: "🍊", label: "Orange" },
      { key: "s3", glyph: "🍇", label: "Raisin" },
      { key: "s4", glyph: "🍑", label: "Pêche" },
      { key: "s5", glyph: "🍎", label: "Pomme" },
      { key: "s6", glyph: "🍒", label: "Cerise" },
      { key: "s7", glyph: "🏆", label: "Trophée" },
    ],
    weights: [8, 6, 5, 4, 3, 2, 1, 1],
    payouts3: [6, 10, 15, 25, 50, 180, 800, 2800],
    match4Multiplier: 5,
    match5Multiplier: 25,
    cherryTwo: 4,
    cherryOne: 1.0,
    cols: 3,
    rows: 1,
    paylines: PL_3x1_SINGLE,
    targetRtp: 0.965,
  },
  // 2. Pirate, mid volatility — 3×3 with 3 horizontal paylines, ≈ 96% RTP
  "tresor-pirates": {
    id: "tresor-pirates",
    name: "Trésor des Pirates",
    tagline: "Pillage et coffres légendaires",
    theme: {
      accent: "text-orange-300",
      glow: "shadow-[0_0_40px_rgba(251,146,60,0.45)]",
      gradient:
        "bg-[radial-gradient(ellipse_at_center,rgba(180,83,9,0.18),transparent_60%)]",
      border: "border-orange-500/40",
    },
    symbols: [
      { key: "s0", glyph: "🦴", label: "Os" },
      { key: "s1", glyph: "⚓", label: "Ancre" },
      { key: "s2", glyph: "🦜", label: "Perroquet" },
      { key: "s3", glyph: "🗡️", label: "Sabre" },
      { key: "s4", glyph: "🗺️", label: "Carte" },
      { key: "s5", glyph: "💀", label: "Crâne" },
      { key: "s6", glyph: "🪙", label: "Doublon" },
      { key: "s7", glyph: "💰", label: "Coffre" },
    ],
    weights: [8, 6, 5, 4, 3, 2, 1, 1],
    payouts3: [5, 10, 15, 30, 80, 250, 1500, 3300],
    match4Multiplier: 5,
    match5Multiplier: 25,
    cherryTwo: 3,
    cherryOne: 0.8,
    cols: 3,
    rows: 3,
    paylines: PL_3x3_ROWS,
    targetRtp: 0.96,
  },
  // 3. Egypt — 3×3 with 5 paylines (rows + diagonals), ≈ 96% RTP
  "pharaon-mystique": {
    id: "pharaon-mystique",
    name: "Pharaon Mystique",
    tagline: "Reliques d'un empire oublié",
    theme: {
      accent: "text-yellow-300",
      glow: "shadow-[0_0_40px_rgba(234,179,8,0.5)]",
      gradient:
        "bg-[radial-gradient(ellipse_at_center,rgba(180,83,9,0.18),rgba(76,29,149,0.18),transparent_60%)]",
      border: "border-yellow-500/40",
    },
    symbols: [
      { key: "s0", glyph: "🐍", label: "Cobra" },
      { key: "s1", glyph: "🐱", label: "Chat" },
      { key: "s2", glyph: "🪲", label: "Scarabée" },
      { key: "s3", glyph: "🏺", label: "Urne" },
      { key: "s4", glyph: "📜", label: "Papyrus" },
      { key: "s5", glyph: "👁️", label: "Œil d'Horus" },
      { key: "s6", glyph: "🐦", label: "Ibis" },
      { key: "s7", glyph: "🔱", label: "Sceptre" },
    ],
    weights: [8, 6, 5, 4, 3, 2, 1, 1],
    payouts3: [4, 8, 14, 28, 80, 350, 1800, 4500],
    match4Multiplier: 5,
    match5Multiplier: 25,
    cherryTwo: 3,
    cherryOne: 0.6,
    cols: 3,
    rows: 3,
    paylines: PL_3x3_FIVE,
    targetRtp: 0.96,
  },
  // 4. Forest fantasy — 5×3 with 9 paylines, ≈ 95% RTP
  "foret-enchantee": {
    id: "foret-enchantee",
    name: "Forêt Enchantée",
    tagline: "Esprits sylvestres et lune mystique",
    theme: {
      accent: "text-emerald-300",
      glow: "shadow-[0_0_40px_rgba(52,211,153,0.45)]",
      gradient:
        "bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18),rgba(76,29,149,0.12),transparent_60%)]",
      border: "border-emerald-400/40",
    },
    symbols: [
      { key: "s0", glyph: "🍃", label: "Feuille" },
      { key: "s1", glyph: "🍄", label: "Champignon" },
      { key: "s2", glyph: "🦌", label: "Cerf" },
      { key: "s3", glyph: "🦊", label: "Renard" },
      { key: "s4", glyph: "🦉", label: "Hibou" },
      { key: "s5", glyph: "🐺", label: "Loup" },
      { key: "s6", glyph: "🌳", label: "Arbre" },
      { key: "s7", glyph: "🌙", label: "Lune" },
    ],
    weights: [8, 6, 5, 4, 3, 2, 1, 1],
    // 5-reel paytable (4-of-a-kind = ×5 of 3-match, 5-of-a-kind = ×25).
    payouts3: [2, 4, 7, 13, 50, 250, 1500, 4200],
    match4Multiplier: 5,
    match5Multiplier: 25,
    cherryTwo: 2,
    cherryOne: 0.4,
    cols: 5,
    rows: 3,
    paylines: PL_5x3_NINE,
    targetRtp: 0.95,
  },
  // 5. Cosmic — 5×3 with 9 paylines, ≈ 94% RTP. Mid-tier rocket
  // (weight 3) gives a 3-of-a-kind ≈ every 1100 spins and pays ×280;
  // 4-of-a-kind ≈ 1/11k for ×1400 and 5-of-a-kind ≈ 1/100k for ×7000.
  // Supernova (weight 1) is the rarer big-money symbol on top of that.
  "inferno-galactique": {
    id: "inferno-galactique",
    name: "Inferno Galactique",
    tagline: "Risque maximum, jackpot supernova",
    theme: {
      accent: "text-fuchsia-300",
      glow: "shadow-[0_0_60px_rgba(217,70,239,0.55)]",
      gradient:
        "bg-[radial-gradient(ellipse_at_center,rgba(126,34,206,0.25),rgba(217,70,239,0.12),transparent_60%)]",
      border: "border-fuchsia-500/50",
    },
    symbols: [
      { key: "s0", glyph: "🪐", label: "Saturne" },
      { key: "s1", glyph: "⭐", label: "Étoile" },
      { key: "s2", glyph: "☄️", label: "Comète" },
      { key: "s3", glyph: "🌌", label: "Galaxie" },
      { key: "s4", glyph: "🚀", label: "Fusée" }, // mid-tier 1/1000 hit
      { key: "s5", glyph: "👽", label: "Alien" },
      { key: "s6", glyph: "🛸", label: "OVNI" },
      { key: "s7", glyph: "💫", label: "Supernova" }, // mega jackpot
    ],
    weights: [8, 6, 5, 4, 3, 2, 1, 1],
    payouts3: [1, 3, 7, 12, 280, 80, 400, 1800],
    match4Multiplier: 5,
    match5Multiplier: 25,
    cherryTwo: 1,
    cherryOne: 0.3,
    cols: 5,
    rows: 3,
    paylines: PL_5x3_NINE,
    targetRtp: 0.94,
  },
};

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

// ────────────────────────────── Poker ──────────────────────────────
// Texas Hold'em across 3 stake levels.

export type PokerTableId = "low" | "mid" | "high";

export type PokerTableConfig = {
  id: PokerTableId;
  name: string;
  smallBlind: number;
  bigBlind: number;
  buyinMin: number;
  buyinMax: number;
  seatCount: number;
  turnDurationMs: number;
  showdownDurationMs: number;
  preBettingDurationMs: number; // pause between hands so readers can see results
  // UI accent class for the lobby card.
  accent: string;
};

export const POKER_TABLES: Record<PokerTableId, PokerTableConfig> = {
  low: {
    id: "low",
    name: "Petite Table",
    smallBlind: 5,
    bigBlind: 10,
    buyinMin: 200,
    buyinMax: 1_000,
    seatCount: 6,
    turnDurationMs: 25_000,
    showdownDurationMs: 4_000,
    preBettingDurationMs: 2_500,
    accent: "text-emerald-300",
  },
  mid: {
    id: "mid",
    name: "Table Moyenne",
    smallBlind: 50,
    bigBlind: 100,
    buyinMin: 2_000,
    buyinMax: 10_000,
    seatCount: 6,
    turnDurationMs: 25_000,
    showdownDurationMs: 4_000,
    preBettingDurationMs: 2_500,
    accent: "text-amber-300",
  },
  high: {
    id: "high",
    name: "Haute Table",
    smallBlind: 500,
    bigBlind: 1_000,
    buyinMin: 20_000,
    buyinMax: 100_000,
    seatCount: 6,
    turnDurationMs: 25_000,
    showdownDurationMs: 5_000,
    preBettingDurationMs: 2_500,
    accent: "text-fuchsia-300",
  },
};

export type PokerPhase =
  | "waiting" // not enough players to start
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown" // hands revealed, pots being awarded
  | "settling"; // brief pause between hands

export type PokerSeatStatus =
  | "empty"
  | "sitting" // sat down but waiting for next hand
  | "playing" // dealt into the current hand
  | "folded"
  | "all-in"
  | "sitout"; // disconnected mid-hand or out of chips

export type PokerSeat = {
  seatIndex: number;
  playerId: string | null;
  playerName: string | null;
  playerColor: string | null;
  // Chip stack (separate from the player's gold balance).
  chips: number;
  // Hole cards: only revealed to self until showdown.
  holeCards: Card[]; // length 0 or 2; visible to self always, others see []
  // Total chips committed in the current betting round.
  currentBet: number;
  // Total chips committed in the entire hand (used for side-pot maths).
  totalCommitted: number;
  status: PokerSeatStatus;
  // True when the seat has acted in this round AND its bet matches the
  // current high bet (or it folded / is all-in).
  hasActed: boolean;
  // Filled in at showdown so winners know what they had.
  showdownHand?: PokerShowdownHand;
};

export type PokerShowdownHand = {
  cards: Card[]; // best 5 of 7
  rankName: string; // e.g. "Suite", "Brelan", "Couleur"
  score: number; // numeric score for comparison
};

export type PokerPot = {
  amount: number;
  // Indices of seats eligible to win this pot (filtered out by all-in cap).
  eligibleSeats: number[];
};

export type PokerState = {
  tableId: PokerTableId;
  phase: PokerPhase;
  seats: PokerSeat[];
  community: Card[]; // 0..5 cards visible
  dealerSeatIndex: number | null;
  activeSeatIndex: number | null;
  // Highest individual bet in the current round; players must match it
  // to call.
  highBet: number;
  // Minimum legal raise *amount* (i.e. how much more you have to put in
  // on top of `highBet` for it to count as a valid raise this round).
  minRaise: number;
  pots: PokerPot[]; // main pot first, then side pots
  phaseEndsAt: number | null;
  lastActionLabel: string | null;
};

export type PokerClientMessage =
  | { type: "poker-sit"; seatIndex: number; buyin: number }
  | { type: "poker-leave" }
  | { type: "poker-action"; action: "fold" | "check" | "call" | "all-in" }
  | { type: "poker-bet"; amount: number } // bet or raise total to amount
  | { type: "chat"; text: string };

export type PokerServerMessage =
  | {
      type: "poker-welcome";
      selfId: string;
      table: PokerTableConfig;
      state: PokerState;
      gold: number;
      chat: ChatMessage[];
    }
  | { type: "poker-state"; state: PokerState }
  | { type: "gold-update"; gold: number }
  | { type: "poker-error"; message: string }
  | { type: "chat"; message: ChatMessage };

// ────────────────────────────── TCG ──────────────────────────────
// Trading-card game shell. One PartyKit room per game; per-game card
// data lives in shared/tcg-pokemon-base.ts (and future siblings).

export type TcgGameId = "pokemon" | "onepiece" | "lol";

export type TcgGameConfig = {
  id: TcgGameId;
  name: string;
  tagline: string;
  packPrice: number;
  packSize: number;
  active: boolean;
  // Tailwind theme classes for the lobby card.
  accent: string;
  border: string;
  glow: string;
  gradient: string;
};

export const TCG_GAMES: Record<TcgGameId, TcgGameConfig> = {
  pokemon: {
    id: "pokemon",
    name: "Pokémon",
    tagline: "Génération 1 — 151 Pokémon, 4 packs thématiques",
    packPrice: 10_000,
    packSize: 5,
    active: true,
    accent: "text-amber-300",
    border: "border-amber-400/40",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.12),rgba(220,38,38,0.08),transparent_60%)]",
  },
  onepiece: {
    id: "onepiece",
    name: "One Piece",
    tagline: "À venir",
    packPrice: 150,
    packSize: 5,
    active: false,
    accent: "text-rose-300",
    border: "border-rose-400/40",
    glow: "shadow-[0_0_40px_rgba(251,113,133,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.12),transparent_60%)]",
  },
  lol: {
    id: "lol",
    name: "League of Legends",
    tagline: "À venir",
    packPrice: 200,
    packSize: 5,
    active: false,
    accent: "text-sky-300",
    border: "border-sky-400/40",
    glow: "shadow-[0_0_40px_rgba(56,189,248,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.12),transparent_60%)]",
  },
};

export type TcgRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "holo-rare"
  | "energy"; // basic energies are functionally common but visually distinct

// Pokemon-specific card shape. Other TCGs will define their own and reuse
// the same TcgCardOwned / pack flow.
export type PokemonEnergyType =
  | "fire"
  | "water"
  | "grass"
  | "lightning"
  | "psychic"
  | "fighting"
  | "colorless";

export type PokemonAttack = {
  name: string;
  cost: PokemonEnergyType[];
  damage?: number; // base damage; effects below may modify
  damageSuffix?: "+" | "x" | "-"; // shown next to damage (e.g. "10×")
  text?: string; // effect description (FR)
};

export type PokemonAbility = {
  name: string;
  text: string;
};

export type PokemonCardData =
  | {
      kind: "pokemon";
      id: string;
      number: number; // Pokédex number
      name: string;
      type: PokemonEnergyType;
      stage: "basic" | "stage1" | "stage2";
      evolvesFrom?: string;
      hp: number;
      weakness?: PokemonEnergyType;
      resistance?: PokemonEnergyType;
      retreatCost: number;
      attacks: PokemonAttack[];
      ability?: PokemonAbility;
      rarity: TcgRarity;
      flavorText?: string;
      art: string;
      // Which of the 4 thematic packs this card is in.
      pack: PokemonPackTypeId;
    }
  | {
      kind: "energy";
      id: string;
      number: number;
      name: string;
      energyType: PokemonEnergyType;
      rarity: TcgRarity;
      art: string;
      // Energies are shared across all packs — no `pack` field.
    };

// What the server emits in pack openings / welcomes — keeps this small
// so we can reuse for non-Pokemon games later by widening the shape.
export type TcgCardOwned = {
  cardId: string;
  count: number;
};

export type TcgPackResult = {
  id: string;
  cards: string[]; // card ids, in reveal order
  cost: number;
  timestamp: number;
};

export type TcgDeckEntry = {
  cardId: string;
  count: number;
};

export type TcgDeck = {
  id: string;
  name: string;
  cards: TcgDeckEntry[];
  updatedAt: number;
};

export type TcgClientMessage =
  | { type: "tcg-buy-pack"; packTypeId: string }
  | {
      type: "tcg-save-deck";
      deckId: string | null; // null = create
      name: string;
      cards: TcgDeckEntry[];
    }
  | { type: "tcg-delete-deck"; deckId: string };

// ─── Pokémon — boosters thématiques par mascotte (Gen 1) ──────────────────
// 4 packs par génération = 3 starters + le légendaire emblématique. Les 151
// Pokémon de la Gen 1 sont répartis équitablement entre ces 4 packs selon
// leur affinité thématique.

export type PokemonPackTypeId =
  | "charizard"
  | "blastoise"
  | "venusaur"
  | "mewtwo";

export type PokemonPackType = {
  id: PokemonPackTypeId;
  name: string;
  description: string;
  glyph: string;
  active: boolean;
  accent: string;
  border: string;
};

export const POKEMON_PACK_TYPES: Record<PokemonPackTypeId, PokemonPackType> = {
  charizard: {
    id: "charizard",
    name: "Pack Dracaufeu",
    description:
      "Feu, Combat, Sol, Roche, Vol — Dracaufeu, Mackogneur, Onix, Aérodactyl, Sulfura…",
    glyph: "🔥",
    active: true,
    accent: "text-orange-300",
    border: "border-orange-500/50",
  },
  blastoise: {
    id: "blastoise",
    name: "Pack Tortank",
    description:
      "Eau, Glace — Tortank, Léviator, Lokhlass, Kabutops, Artikodin, Lippoutou…",
    glyph: "🌊",
    active: true,
    accent: "text-sky-300",
    border: "border-sky-500/50",
  },
  venusaur: {
    id: "venusaur",
    name: "Pack Florizarre",
    description:
      "Plante, Insecte, Poison — Florizarre, Rafflesia, Papilusion, Nidoking, Arbok…",
    glyph: "🌿",
    active: true,
    accent: "text-emerald-300",
    border: "border-emerald-500/50",
  },
  mewtwo: {
    id: "mewtwo",
    name: "Pack Mewtwo",
    description:
      "Psy, Spectre, Électrique, Dragon, Normal spéciaux — Mewtwo, Mew, Ectoplasma, Dracolosse…",
    glyph: "🧠",
    active: true,
    accent: "text-fuchsia-300",
    border: "border-fuchsia-500/50",
  },
};

export type TcgServerMessage =
  | {
      type: "tcg-welcome";
      selfId: string;
      gold: number;
      collection: TcgCardOwned[];
      gameId: TcgGameId;
      freePacks: number;
      decks: TcgDeck[];
    }
  | {
      type: "tcg-pack-opened";
      pack: TcgPackResult;
      newCounts: TcgCardOwned[];
      freePacks: number;
      usedFreePack: boolean;
    }
  | { type: "tcg-decks"; decks: TcgDeck[] }
  | { type: "gold-update"; gold: number }
  | { type: "tcg-error"; message: string };

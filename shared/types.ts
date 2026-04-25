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
    accent: string; // text colour for highlights
    glow: string; // box-shadow on win
    gradient: string; // background gradient class
    border: string;
  };
  // 8 symbols low → high tier. The first one is treated as the "cherry"
  // bonus symbol (1- and 2-leftmost mini-payouts).
  symbols: { key: SlotsSymbolKey; glyph: string; label: string }[];
  // Reel weights, same order as `symbols`. Higher = more frequent.
  weights: number[];
  // 3-of-a-kind multiplier per symbol (same order).
  payouts3: number[];
  // Bonus payouts for the lowest symbol on the leftmost reel.
  cherryTwo: number;
  cherryOne: number;
  // Display: target RTP (informational only, math is what it is).
  targetRtp: number;
};

export type SlotsWinKind =
  | "none"
  | "three"
  | "two-cherry"
  | "one-cherry";

export type SlotsSpin = {
  id: string;
  reels: SlotsSymbolKey[]; // length = SLOTS_CONFIG.reelCount
  bet: number;
  win: number;
  multiplier: number;
  kind: SlotsWinKind;
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
    cherryTwo: 4,
    cherryOne: 1.0,
    targetRtp: 0.965,
  },
  // 2. Pirate, mid volatility — ≈ 96% RTP, max ×1500
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
    cherryTwo: 3,
    cherryOne: 0.8,
    targetRtp: 0.96,
  },
  // 3. Egypt, med-high volatility — ≈ 96% RTP, max ×4500
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
    cherryTwo: 3,
    cherryOne: 0.6,
    targetRtp: 0.96,
  },
  // 4. Forest fantasy, high volatility — ≈ 95% RTP, max ×7500
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
    payouts3: [3, 6, 11, 20, 80, 400, 2500, 7500],
    cherryTwo: 2,
    cherryOne: 0.4,
    targetRtp: 0.95,
  },
  // 5. Cosmic, extreme volatility — ≈ 94% RTP. Mid-tier rocket symbol
  // (weight 3) lands ≈ 1/1000 spins for a ×500 hit — that's the "biggest
  // jackpot in 1000 spins" the spec asked for. The supernova (weight 1)
  // is a rarer ×3000 super-bonus that pops up roughly 1/27000 spins.
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
    payouts3: [2, 5, 10, 18, 500, 120, 600, 3000],
    cherryTwo: 1,
    cherryOne: 0.3,
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

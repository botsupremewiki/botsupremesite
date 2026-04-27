export type Direction = "up" | "down" | "left" | "right";

// ─── Apparence du personnage ──────────────────────────────────────────────
// Tous les champs sont optionnels — le rendu fallback sur des défauts dérivés
// de `color` (la couleur attribuée par le serveur PartyKit). Liste finie pour
// que le client puisse dispatcher dans un switch sans surprise.

export type SkinTone = "pale" | "beige" | "tan" | "brown" | "dark";
export type HairStyle = "short" | "long" | "bun" | "mohawk" | "bald";
export type HatStyle =
  | "none"
  | "cap"
  | "crown"
  | "wizard"
  | "headband"
  | "horns";
export type GlassesStyle = "none" | "round" | "shades" | "monocle";

export type Appearance = {
  bodyColor?: string; // "#rrggbb"
  skinTone?: SkinTone;
  hairStyle?: HairStyle;
  hairColor?: string; // "#rrggbb"
  hat?: HatStyle;
  glasses?: GlassesStyle;
};

export type Player = {
  id: string;
  authId?: string;
  name: string;
  avatarUrl?: string;
  x: number;
  y: number;
  direction: Direction;
  color: string;
  appearance?: Appearance;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  // Badges dérivés des rôles Discord du joueur. Le rendu côté UI fait
  // gagner le plus haut : ADMIN > BOOSTER. Cf. `web/app/play/chat-panel.tsx`.
  isAdmin?: boolean;
  isBooster?: boolean;
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
  // Grille fixe 5×5 = 25 cases. Le seul levier joueur est le nombre de mines.
  gridSize: 5,
  minMines: 1,
  maxMines: 24,
  minBet: 10,
  maxBet: 10_000_000,
  // RTP interpolé linéairement entre minMines (rtpAtMin) et maxMines
  // (rtpAtMax). 1 mine = 90% (long jeu), 24 mines = 95% (one-shot 25× quasi).
  rtpAtMin: 0.9,
  rtpAtMax: 0.95,
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
  // Toujours MINES_CONFIG.gridSize × MINES_CONFIG.gridSize.
  minesCount: number;
  bet: number;
  revealedCount: number;
  multiplier: number;
  potentialPayout: number;
  nextMultiplier: number;
  status: MinesStatus;
  tiles: MinesTile[]; // row-major, length = gridSize²
  // Only present when game ended (busted or cashed):
  minesMap?: number[]; // indices where mines were
};

export type MinesClientMessage =
  | { type: "mines-start"; minesCount: number; bet: number }
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
  autoSpinDurationMs: 1800, // moitié plus lent qu'avant : on voit les gains
  autoSpinReelStaggerMs: 320,
  autoSpinIntervalMs: 2200, // delay between consecutive autospins
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
    tagline: "Pokémon TCG Pocket — set Puissance Génétique (266 cartes)",
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

// Raretés Pokémon TCG Pocket. Du plus commun au plus rare :
//   diamond-1 ◆          (commune)
//   diamond-2 ◆◆         (peu commune)
//   diamond-3 ◆◆◆        (rare)
//   diamond-4 ◆◆◆◆       (rare ex)
//   star-1    ★          (full art)
//   star-2    ★★         (full art alt)
//   star-3    ★★★        (immersive art)
//   crown     👑         (couronne brillante)
//   promo                (sans rareté / variantes)
export type TcgRarity =
  | "diamond-1"
  | "diamond-2"
  | "diamond-3"
  | "diamond-4"
  | "star-1"
  | "star-2"
  | "star-3"
  | "crown"
  | "promo";

// Types Pokémon TCG (incluant les types Pocket récents).
export type PokemonEnergyType =
  | "fire"
  | "water"
  | "grass"
  | "lightning"
  | "psychic"
  | "fighting"
  | "darkness"
  | "metal"
  | "dragon"
  | "fairy"
  | "colorless";

export type PokemonAttack = {
  name: string; // FR ex: "Danse Flammes"
  cost: PokemonEnergyType[];
  damage?: number;
  damageSuffix?: "+" | "x" | "-";
  text?: string | null; // effet en FR (descriptif uniquement, pas exécuté par le moteur MVP)
};

// Note : ability + attack effects machine-readable retirés avec la refonte
// Pocket. Le moteur exécute juste le damage. Les effets descriptifs vivent
// dans `attack.text` pour info au joueur. Réintroduire si besoin plus tard.

export type PokemonCardData = {
  kind: "pokemon";
  id: string; // ex "A1-035"
  number: number; // localId dans le set (pour tri d'affichage)
  pokedexId: number | null;
  name: string; // ex "Dracaufeu" (FR)
  type: PokemonEnergyType;
  stage: "basic" | "stage1" | "stage2";
  evolvesFrom?: string | null;
  hp: number;
  weakness?: PokemonEnergyType | null;
  retreatCost: number;
  attacks: PokemonAttack[];
  rarity: TcgRarity;
  image: string; // URL high.webp tcgdex.net
  description?: string | null;
  illustrator?: string | null;
  isEx: boolean;
  // Booster thématique principal de la carte. Une carte peut apparaître dans
  // plusieurs boosters (ex Couronnes), on garde le premier.
  pack: PokemonPackTypeId;
  // Boosters supplémentaires si carte multi-pack (sinon array vide).
  extraPacks?: PokemonPackTypeId[];
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
  | { type: "tcg-delete-deck"; deckId: string }
  // Force re-fetch + broadcast pour soi-même.
  | { type: "tcg-refresh" }
  // Signale qu'une transaction (achat/vente/annulation) a impacté ces users.
  // Le serveur re-fetch + envoie un tcg-welcome aux connexions concernées.
  | { type: "tcg-notify-tx"; userIds: string[] };

// ─── Boosters Pokémon TCG Pocket — set A1 "Puissance Génétique" ───────────
// 3 boosters thématiques officiels comme dans l'app Pocket. Chaque carte
// appartient à 1 booster principal (et parfois plusieurs : ex. les couronnes).

export type PokemonPackTypeId = "mewtwo" | "charizard" | "pikachu";

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
  mewtwo: {
    id: "mewtwo",
    name: "Pack Mewtwo",
    description:
      "Booster Mewtwo — Psy, Plante, Combat dominants (Mewtwo, Florizarre, Mackogneur, Aérodactyl…).",
    glyph: "🧠",
    active: true,
    accent: "text-fuchsia-300",
    border: "border-fuchsia-500/50",
  },
  charizard: {
    id: "charizard",
    name: "Pack Dracaufeu",
    description:
      "Booster Dracaufeu — Feu, Métal, Ténèbres dominants (Dracaufeu, Magnéton, Gengar, Onix…).",
    glyph: "🔥",
    active: true,
    accent: "text-orange-300",
    border: "border-orange-500/50",
  },
  pikachu: {
    id: "pikachu",
    name: "Pack Pikachu",
    description:
      "Booster Pikachu — Électrique, Eau, Incolore dominants (Pikachu, Tortank, Léviator, Roucarnage…).",
    glyph: "⚡",
    active: true,
    accent: "text-yellow-300",
    border: "border-yellow-500/50",
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

// ─── Pokémon Battle (Phase 2 : matchmaking + setup) ────────────────────────

export type BattleSeatId = "p1" | "p2";

export type BattlePhase =
  | "waiting" // en attente du second joueur
  | "setup" // chacun choisit son Actif + son Banc
  | "playing"
  | "ended";

export type BattleStatus =
  | "asleep"
  | "burned"
  | "confused"
  | "paralyzed"
  | "poisoned";

export type BattleCard = {
  // Position relative au joueur (0..N) — utilisé comme clé d'animation côté client.
  uid: string;
  cardId: string; // référence vers PokemonCardData
  attachedEnergies: string[]; // card_ids des Énergies attachées
  damage: number; // marqueurs de dégâts cumulés
  statuses: BattleStatus[];
  // Ne devient false qu'au tour suivant (interdit d'attaquer le tour où on est posé).
  playedThisTurn: boolean;
};

export type BattlePlayerPublicState = {
  authId: string;
  username: string;
  deckSize: number; // nombre de cartes restantes dans le deck
  handCount: number; // nombre de cartes en main (cachées pour l'adverse)
  active: BattleCard | null;
  bench: BattleCard[]; // 0..3 (Pocket : banc max 3)
  discardCount: number;
  // Compteur de KO infligés à l'adversaire ce match. Premier à BATTLE_KO_TARGET = 3 gagne.
  koCount: number;
  hasSetup: boolean;
  // Quand l'Actif vient d'être KO, le joueur doit promouvoir un Pokémon
  // du Banc avant que l'autre puisse jouer.
  mustPromoteActive: boolean;
  // Limites par tour — exposées pour que l'UI grise les actions épuisées.
  energyAttachedThisTurn: boolean;
  hasRetreatedThisTurn: boolean;
  // Pocket : énergie générée automatiquement chaque tour, prête à être
  // attachée à un Pokémon (1 attache max/tour). null si pas d'énergie en
  // attente (consommée, ou tour 1 du first player qui n'en génère pas).
  pendingEnergy: PokemonEnergyType | null;
};

export type BattleSelfState = BattlePlayerPublicState & {
  // Cartes de la main visibles pour soi.
  hand: string[]; // card_ids
};

export type BattleState = {
  roomId: string;
  phase: BattlePhase;
  // Toujours envoyé depuis la perspective du destinataire : self = vous,
  // opponent = l'autre.
  self: BattleSelfState | null;
  opponent: BattlePlayerPublicState | null;
  selfSeat: BattleSeatId | null;
  activeSeat: BattleSeatId | null; // qui joue
  turnNumber: number;
  winner: BattleSeatId | null;
  log: string[]; // 20 derniers évènements
};

export type BattleClientMessage =
  // Setup phase actions
  | { type: "battle-set-active"; handIndex: number }
  | { type: "battle-add-bench"; handIndex: number }
  | { type: "battle-remove-bench"; benchIndex: number }
  | { type: "battle-confirm-setup" }
  // Playing phase actions
  | { type: "battle-play-basic"; handIndex: number }
  // Pocket : pas de handIndex (énergies auto-générées chaque tour, attachées
  // au choix sur n'importe quel Pokémon en jeu).
  | { type: "battle-attach-energy"; targetUid: string }
  | { type: "battle-evolve"; handIndex: number; targetUid: string }
  | { type: "battle-retreat"; benchIndex: number }
  | { type: "battle-attack"; attackIndex: number }
  | { type: "battle-promote-active"; benchIndex: number }
  // Always available
  | { type: "battle-end-turn" }
  | { type: "battle-concede" }
  | { type: "chat"; text: string };

// ─── Battle constants (Pocket-style) ───────────────────────────────────────

export const BATTLE_CONFIG = {
  /** Premier à atteindre ce nombre de KO infligés gagne. */
  koWinTarget: 3,
  /** Banc max (en plus de l'Actif). Pocket : 3 (vs 5 dans le TCG complet). */
  maxBench: 3,
  /** Cartes piochées au setup. Pocket : 5 (vs 7 dans le TCG complet). */
  openingHandSize: 5,
  /** Taille de deck exacte requise. Pocket : 20 (vs 60 dans le TCG complet). */
  deckSize: 20,
  /** Max copies d'une même carte dans un deck. Pocket : 2 (vs 4 dans le TCG complet). */
  maxCopies: 2,
} as const;

export type BattleServerMessage =
  | { type: "battle-welcome"; selfId: string; selfSeat: BattleSeatId | null }
  | { type: "battle-state"; state: BattleState }
  | { type: "battle-error"; message: string }
  | { type: "battle-quest-reward"; botWins: number; granted: boolean }
  | { type: "chat"; message: ChatMessage };

// ─── Battle lobby (matchmaking) ────────────────────────────────────────────

export type BattleLobbyClientMessage =
  | { type: "queue"; deckId: string }
  | { type: "leave-queue" };

export type BattleLobbyServerMessage =
  | { type: "queued"; position: number }
  | { type: "matched"; roomId: string; deckId: string }
  | { type: "lobby-error"; message: string };

// ────────────────────────────── ETERNUM (RPG idle) ──────────────────────────
// 4ᵉ univers. Héros + classe + élément + collection familiers + idle + combat
// tour-par-tour. Voir memory/project_eternum_rpg.md pour la spec complète.

export type EternumClassId =
  | "warrior"
  | "paladin"
  | "assassin"
  | "mage"
  | "priest"
  | "vampire";

export type EternumElementId =
  | "fire"
  | "water"
  | "wind"
  | "earth"
  | "light"
  | "dark";

export type EternumJobId =
  | "blacksmith"
  | "tanner"
  | "weaver"
  | "jeweler"
  | "armorer"
  | "baker";

export type EternumRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary"
  | "prismatic";

export type EternumClassConfig = {
  id: EternumClassId;
  name: string;
  glyph: string;
  short: string;
  role: string;
  // Stats de base au niveau 1 — équilibrées pour qu'aucune classe ne
  // domine (somme similaire ~282, profils variés).
  baseStats: { hp: number; atk: number; def: number; spd: number };
  // Croissance par niveau (linéaire).
  growth: { hp: number; atk: number; def: number; spd: number };
  // Sorts / passif décrits côté UI seulement pour MVP — les implémentations
  // réelles (avec damage formulas) arriveront en Phase 4 (combat engine).
  passiveName: string;
  passiveText: string;
  spell1Name: string;
  spell2Name: string;
  ultimateName: string;
  // Tailwind theme.
  accent: string;
  border: string;
  gradient: string;
};

export const ETERNUM_CLASSES: Record<EternumClassId, EternumClassConfig> = {
  warrior: {
    id: "warrior",
    name: "Guerrier",
    glyph: "⚔️",
    short: "Tank physique",
    role: "Tank mêlée — encaisse, immobilise les ennemis.",
    baseStats: { hp: 220, atk: 28, def: 22, spd: 12 },
    growth: { hp: 18, atk: 2.5, def: 2.0, spd: 0.6 },
    passiveName: "Endurance",
    passiveText: "+15% HP max et 10% de chance d'ignorer un coup critique.",
    spell1Name: "Frappe lourde",
    spell2Name: "Provocation (taunt)",
    ultimateName: "Tornade d'acier",
    accent: "text-amber-200",
    border: "border-amber-400/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.10),transparent_70%)]",
  },
  paladin: {
    id: "paladin",
    name: "Paladin",
    glyph: "🛡️",
    short: "Tank-soigneur",
    role: "Hybride tank/heal — protège l'équipe et restaure les PV.",
    baseStats: { hp: 200, atk: 22, def: 24, spd: 13 },
    growth: { hp: 16, atk: 2.0, def: 2.2, spd: 0.7 },
    passiveName: "Aura sacrée",
    passiveText: "Heal de 3% HP max à toute l'équipe début de tour.",
    spell1Name: "Bouclier de foi",
    spell2Name: "Lumière purifiante",
    ultimateName: "Jugement divin",
    accent: "text-yellow-100",
    border: "border-yellow-300/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(254,240,138,0.10),transparent_70%)]",
  },
  assassin: {
    id: "assassin",
    name: "Assassin",
    glyph: "🗡️",
    short: "Burst phys mêlée",
    role: "Furtif — élimine les cibles fragiles en 1 ou 2 coups.",
    baseStats: { hp: 150, atk: 36, def: 12, spd: 22 },
    growth: { hp: 12, atk: 3.2, def: 1.0, spd: 1.2 },
    passiveName: "Frappe sournoise",
    passiveText: "+30% dégâts critiques et +10% chance crit.",
    spell1Name: "Lame ombre",
    spell2Name: "Esquive (1 tour invisible)",
    ultimateName: "Dance des lames",
    accent: "text-violet-200",
    border: "border-violet-400/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.10),transparent_70%)]",
  },
  mage: {
    id: "mage",
    name: "Mage",
    glyph: "🔥",
    short: "DPS magique AoE",
    role: "Sorts de zone — gros dégâts à toute l'équipe ennemie.",
    baseStats: { hp: 140, atk: 38, def: 10, spd: 16 },
    growth: { hp: 10, atk: 3.5, def: 0.8, spd: 0.9 },
    passiveName: "Maîtrise élémentaire",
    passiveText: "+20% dégâts du sort élémentaire correspondant à ton élément.",
    spell1Name: "Boule de feu",
    spell2Name: "Mur élémentaire",
    ultimateName: "Cataclysme",
    accent: "text-rose-200",
    border: "border-rose-400/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.10),transparent_70%)]",
  },
  priest: {
    id: "priest",
    name: "Prêtre",
    glyph: "✨",
    short: "Buff / debuff",
    role: "Support — booste l'équipe, affaiblit les ennemis.",
    baseStats: { hp: 160, atk: 18, def: 14, spd: 18 },
    growth: { hp: 13, atk: 1.6, def: 1.2, spd: 1.0 },
    passiveName: "Bénédiction",
    passiveText:
      "Au début de chaque tour, +5% atk à un allié au hasard pour 2 tours.",
    spell1Name: "Bénir (buff atk équipe)",
    spell2Name: "Malédiction (debuff def ennemi)",
    ultimateName: "Sermon divin",
    accent: "text-sky-200",
    border: "border-sky-400/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.10),transparent_70%)]",
  },
  vampire: {
    id: "vampire",
    name: "Vampire",
    glyph: "🩸",
    short: "Lifesteal",
    role: "Soutenu par le sang — soigne en infligeant des dégâts.",
    baseStats: { hp: 180, atk: 30, def: 14, spd: 17 },
    growth: { hp: 14, atk: 2.6, def: 1.3, spd: 0.9 },
    passiveName: "Soif éternelle",
    passiveText: "Récupère 25% des dégâts infligés en HP.",
    spell1Name: "Morsure",
    spell2Name: "Brume sanguine (heal AoE alliés)",
    ultimateName: "Réveil du Comte",
    accent: "text-rose-300",
    border: "border-rose-500/40",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(225,29,72,0.10),transparent_70%)]",
  },
};

export type EternumElementConfig = {
  id: EternumElementId;
  name: string;
  glyph: string;
  beats: EternumElementId | null; // bat (cycle base)
  unlockable: boolean; // true pour Lumière/Ombre — verrouillés au début
  accent: string;
};

export const ETERNUM_ELEMENTS: Record<EternumElementId, EternumElementConfig> =
  {
    fire: {
      id: "fire",
      name: "Feu",
      glyph: "🔥",
      beats: "wind",
      unlockable: false,
      accent: "text-orange-300",
    },
    wind: {
      id: "wind",
      name: "Vent",
      glyph: "🌪️",
      beats: "earth",
      unlockable: false,
      accent: "text-emerald-200",
    },
    earth: {
      id: "earth",
      name: "Terre",
      glyph: "🌍",
      beats: "water",
      unlockable: false,
      accent: "text-amber-300",
    },
    water: {
      id: "water",
      name: "Eau",
      glyph: "💧",
      beats: "fire",
      unlockable: false,
      accent: "text-sky-300",
    },
    light: {
      id: "light",
      name: "Lumière",
      glyph: "✨",
      beats: "dark",
      unlockable: true,
      accent: "text-yellow-100",
    },
    dark: {
      id: "dark",
      name: "Ombre",
      glyph: "🌑",
      beats: "light",
      unlockable: true,
      accent: "text-violet-300",
    },
  };

/** Matchup élémentaire : 1.5 = avantage, 0.7 = désavantage, 1.0 = neutre.
 *  Light ↔ Dark se contrent mutuellement, neutres face aux 4 base. */
export function eternumElementMultiplier(
  attacker: EternumElementId,
  defender: EternumElementId,
): number {
  const att = ETERNUM_ELEMENTS[attacker];
  const def = ETERNUM_ELEMENTS[defender];
  if (att.beats === defender) return 1.5;
  if (def.beats === attacker) return 0.7;
  return 1.0;
}

/** Stats calculées d'un héros à un niveau donné (sans équipement). */
export function eternumHeroStats(
  classId: EternumClassId,
  level: number,
): { hp: number; atk: number; def: number; spd: number } {
  const c = ETERNUM_CLASSES[classId];
  const lv = Math.max(1, Math.min(100, level));
  return {
    hp: Math.round(c.baseStats.hp + c.growth.hp * (lv - 1)),
    atk: Math.round(c.baseStats.atk + c.growth.atk * (lv - 1)),
    def: Math.round(c.baseStats.def + c.growth.def * (lv - 1)),
    spd: Math.round(c.baseStats.spd + c.growth.spd * (lv - 1)),
  };
}

/** Courbe XP : XP requis pour passer du niveau N → N+1.
 *  Formule : 100 * N^1.6 (douce au début, plus raide à haut niveau). */
export function eternumXpForNextLevel(currentLevel: number): number {
  return Math.round(100 * Math.pow(currentLevel, 1.6));
}

export type EternumHero = {
  classId: EternumClassId;
  elementId: EternumElementId;
  jobId: EternumJobId | null;
  level: number;
  xp: number;
  evolutionStage: number;
  prestigeCount: number;
  energy: number;
  energyUpdatedAt: number; // ms epoch
  idleStage: number;
  idleUpdatedAt: number; // ms epoch
};

export type EternumIdleCollection = {
  osGained: number;
  xpGained: number;
  stage: number;
  ticks: number;
};

// Métiers — config UI.
export type EternumJobConfig = {
  id: EternumJobId;
  name: string;
  glyph: string;
  description: string;
  classes: EternumClassId[]; // pour qui le métier crafte (vide = toutes)
};

export const ETERNUM_JOBS: Record<EternumJobId, EternumJobConfig> = {
  blacksmith: {
    id: "blacksmith",
    name: "Forgeron",
    glyph: "🔨",
    description: "Crafte les armures lourdes (casque/plastron/pantalon/chaussures).",
    classes: ["warrior", "paladin"],
  },
  tanner: {
    id: "tanner",
    name: "Tanneur",
    glyph: "🐉",
    description: "Crafte les armures de cuir.",
    classes: ["assassin", "vampire"],
  },
  weaver: {
    id: "weaver",
    name: "Tisserand",
    glyph: "🧵",
    description: "Crafte les robes et armures en tissu.",
    classes: ["mage", "priest"],
  },
  jeweler: {
    id: "jeweler",
    name: "Bijoutier",
    glyph: "💍",
    description: "Crafte anneaux et amulettes.",
    classes: [],
  },
  armorer: {
    id: "armorer",
    name: "Maître d'armes",
    glyph: "⚒️",
    description: "Crafte toutes les armes du jeu.",
    classes: [],
  },
  baker: {
    id: "baker",
    name: "Boulanger",
    glyph: "🍞",
    description:
      "Crafte du pain qui rend de l'énergie (cooldown / cap journalier).",
    classes: [],
  },
};

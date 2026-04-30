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
    tagline:
      "One Piece TCG — OP-09 + ST-15 à ST-21 (281 cartes FR — collection seulement, combat à venir)",
    packPrice: 10_000,
    packSize: 6,
    active: true,
    accent: "text-rose-300",
    border: "border-rose-400/40",
    glow: "shadow-[0_0_40px_rgba(251,113,133,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,113,133,0.12),transparent_60%)]",
  },
  lol: {
    id: "lol",
    name: "League of Legends",
    tagline:
      "Legends of Runeterra — Set 1 « Fondations » (318 cartes FR — collection seulement, combat à venir)",
    packPrice: 200,
    packSize: 5,
    active: true,
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

// Note : `attack.text` est descriptif (FR officiel) — mais désormais parsé
// côté serveur (party/src/lib/attack-effects.ts) pour ~25 patterns
// (statuts, multi-coin, scaling, heal, etc).

/** Talent (ability en VO) d'un Pokémon. Effet permanent ou activable
 *  1 fois par tour qui modifie les règles. Implémenté côté serveur dans
 *  party/src/lib/abilities.ts pour les ~13 talents A1. */
export type PokemonAbility = {
  /** Nom FR officiel (ex « Pendulo Dodo », « Coque Armure »). */
  name: string;
  /** Texte officiel de l'effet (FR). Affiché dans la sidebar. */
  effect: string;
  /** Mode d'activation :
   *   • "passive" : appliqué automatiquement sans clic (Coque Armure −10).
   *   • "activated" : 1× par tour, clic du joueur sur la carte. */
  kind: "passive" | "activated";
};

export type PokemonCard = {
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
  ability?: PokemonAbility | null;
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

// Cartes Dresseur (Supporter / Objet / Outil / Stade dans Pocket).
// Collectionnables et présentes dans les boosters comme des Pokémon.
// Le moteur de combat MVP les ignore (pas jouables — restent en main).
export type TrainerCard = {
  kind: "trainer";
  id: string;
  number: number;
  name: string;
  rarity: TcgRarity;
  image: string;
  illustrator?: string | null;
  effect?: string | null; // texte FR de l'effet
  trainerType: "supporter" | "item" | "tool" | "stadium";
  pack: PokemonPackTypeId;
  extraPacks?: PokemonPackTypeId[];
  // Cartes utility "starter" (Potion, Poké Ball, Pokédex…) données
  // automatiquement à chaque joueur au premier login en 2 exemplaires
  // chacune. NON droppables en booster (le serveur les filtre du pool).
  starter?: boolean;
};

export type PokemonCardData = PokemonCard | TrainerCard;

// ─── Runeterra (LoL TCG) — Set 1 « Fondations » ──────────────────────────
// Clone fidèle de Legends of Runeterra (Riot a sunset le multijoueur en 2024).
// Les cartes proviennent du data feed officiel Riot destiné aux outils
// communautaires. Voir scripts/runeterra-fetch.mjs.

// Set 1 : 6 régions de base. Les autres (Bilgewater, Targon, Shurima,
// Bandle City, Runeterra, etc.) arrivent dans les sets ultérieurs.
//
// Note : 4 cartes Set 1 (Teemo, Heimerdinger + leurs niveaux 2) ont été
// rétroactivement étendues à BandleCity par Riot — elles restent dual-
// région avec PiltoverZaun pour le filtrage Set 1. La string "BandleCity"
// peut donc apparaître dans `RuneterraCard.regions` sans être typée ici.
export type RuneterraRegion =
  | "Demacia"
  | "Noxus"
  | "Ionia"
  | "Freljord"
  | "PiltoverZaun"
  | "ShadowIsles";

export type RuneterraRegionConfig = {
  id: RuneterraRegion;
  name: string; // FR display
  abbreviation: string;
  // Tailwind theme classes pour la collection / deck builder.
  accent: string;
  border: string;
  glow: string;
  gradient: string;
};

export const RUNETERRA_REGIONS: Record<RuneterraRegion, RuneterraRegionConfig> = {
  Demacia: {
    id: "Demacia",
    name: "Demacia",
    abbreviation: "DE",
    accent: "text-yellow-200",
    border: "border-yellow-300/40",
    glow: "shadow-[0_0_40px_rgba(254,240,138,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(254,240,138,0.12),transparent_60%)]",
  },
  Noxus: {
    id: "Noxus",
    name: "Noxus",
    abbreviation: "NX",
    accent: "text-red-300",
    border: "border-red-500/40",
    glow: "shadow-[0_0_40px_rgba(248,113,113,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.15),transparent_60%)]",
  },
  Ionia: {
    id: "Ionia",
    name: "Ionia",
    abbreviation: "IO",
    accent: "text-pink-200",
    border: "border-pink-400/40",
    glow: "shadow-[0_0_40px_rgba(244,114,182,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(244,114,182,0.12),transparent_60%)]",
  },
  Freljord: {
    id: "Freljord",
    name: "Freljord",
    abbreviation: "FR",
    accent: "text-cyan-200",
    border: "border-cyan-400/40",
    glow: "shadow-[0_0_40px_rgba(103,232,249,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(103,232,249,0.12),transparent_60%)]",
  },
  PiltoverZaun: {
    id: "PiltoverZaun",
    name: "Piltover & Zaun",
    abbreviation: "PZ",
    accent: "text-orange-300",
    border: "border-orange-500/40",
    glow: "shadow-[0_0_40px_rgba(251,146,60,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(251,146,60,0.12),transparent_60%)]",
  },
  ShadowIsles: {
    id: "ShadowIsles",
    name: "Îles obscures",
    abbreviation: "SI",
    accent: "text-emerald-300",
    border: "border-emerald-500/40",
    glow: "shadow-[0_0_40px_rgba(52,211,153,0.4)]",
    gradient:
      "bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.12),transparent_60%)]",
  },
};

export type RuneterraRarity =
  | "Common"
  | "Rare"
  | "Epic"
  | "Champion"
  | "None"; // tokens / non-collectibles

export type RuneterraSpellSpeed = "Burst" | "Fast" | "Slow" | "Focus";

export type RuneterraCardType =
  | "Unit"
  | "Spell"
  | "Landmark"
  | "Ability"
  | "Equipment"
  | "Trap";

export type RuneterraSupertype = "Champion" | "None";

// Une carte Runeterra. On garde le ref anglais pour les identifiants
// stables (rarity, spellSpeed, keywordRefs) que le moteur consomme, et le
// libellé FR (keywords) pour l'UI.
export type RuneterraCard = {
  cardCode: string; // ex "01IO012"
  name: string; // FR ex "Yasuo"
  description: string; // FR formatté (peut contenir <br>, <style>)
  descriptionRaw: string; // FR brut sans HTML
  levelupDescription?: string; // condition de level-up (champions only)
  levelupDescriptionRaw?: string;
  flavorText?: string;
  artistName?: string;
  cost: number;
  attack?: number; // unités uniquement
  health?: number; // unités uniquement
  type: RuneterraCardType;
  supertype: RuneterraSupertype;
  rarity: RuneterraRarity;
  spellSpeed?: RuneterraSpellSpeed; // sorts uniquement
  // Régions de la carte. Une carte est typiquement mono-région en Set 1.
  // Champions multi-régions (ex Origines) viendront avec les sets futurs.
  regions: string[];
  keywords?: string[]; // FR display
  keywordRefs?: string[]; // English refs stables (Elusive, Burst, …)
  subtypes?: string[]; // ex ["Yordle"], ou nom du champion pour ses cartes
  // Cartes invoquées / niveau-up (cardCodes liés). Ex Yasuo niveau 1
  // référence Yasuo niveau 2 ici.
  associatedCardRefs?: string[];
  collectible: boolean;
  set: string; // "Set1"
  image?: string; // URL CDN Riot — carte avec cadre (gameAbsolutePath)
  fullArt?: string; // URL CDN Riot — illustration sans cadre (fullAbsolutePath)
};

export type RuneterraCardData = RuneterraCard;

// ─── Runeterra Battle (Phase 3.1 : skeleton round/mulligan, pas encore de
// combat ni de spells/keywords). État envoyé du serveur PartyKit au client.

export type RuneterraSeatId = "p1" | "p2";

export type RuneterraBattlePhase =
  | "waiting" // en attente du second joueur
  | "mulligan" // chaque joueur choisit ses cartes à remplacer
  | "round" // round en cours
  | "ended";

export type RuneterraBattleUnit = {
  uid: string;
  cardCode: string;
  // Stats courantes (peuvent diverger des stats imprimées via buffs/debuffs).
  power: number;
  health: number;
  damage: number; // dégâts cumulés
  keywords: string[]; // mot-clés actifs (refs anglaises)
  level: number; // 1 ou 2 (champions). 1 par défaut.
  playedThisRound: boolean; // ne peut pas attaquer le tour où on est posé
  // Phase 3.4 : Barrière consommée ce round (réinitialisée à startRound).
  // Inerte si l'unité n'a pas le mot-clé "Barrier".
  barrierUsed: boolean;
  // Phase 3.5 + 3.10 + 3.12 : compteurs pour conditions de level-up champion.
  strikes: number; // nombre de fois où cette unité a frappé en combat
  kills: number; // ennemis qu'elle a tués au combat
  damageTaken: number; // total dégâts effectifs subis (post-Barrier/Tough)
  nexusStrikes: number; // fois où cette unité a frappé le nexus ennemi (Zed)
  // Phase 3.7 : buffs temporaires expirant à endRound (les buffs permanents
  // sont déjà appliqués sur power/health). Defaults à 0.
  endOfRoundPowerBuff: number;
  endOfRoundHealthBuff: number;
  // Phase 3.8c : Gel (Frostbite). Quand frozen=true, power = 0 pour le
  // round (le delta est tracké dans endOfRoundPowerBuff pour restauration
  // à endRound). L'unité ne peut pas attaquer (power=0 < 1).
  frozen: boolean;
  // Phase 3.11 : Étourdissement (Stun). Retire l'unité du combat pour
  // ce round (ne peut pas attaquer ni bloquer). Reset à endRound.
  stunned: boolean;
};

// État public d'un joueur (visible par l'adversaire). Pas de hand, pas de
// deck contents — juste les comptes.
export type RuneterraPlayerPublicState = {
  authId: string;
  username: string;
  deckSize: number;
  handCount: number;
  bench: RuneterraBattleUnit[];
  mana: number;
  manaMax: number;
  spellMana: number; // banking 0-3
  nexusHealth: number;
  attackToken: boolean;
  hasMulliganed: boolean;
};

// État "self" : public + ta main visible (cardCodes).
export type RuneterraSelfState = RuneterraPlayerPublicState & {
  hand: string[]; // cardCodes (parallèle à handUids)
  // Phase 3.54 : uids parallèles à hand pour corréler les cardBuffs.
  handUids?: string[];
  // Phase 3.54 : buffs persistants attachés aux cartes par uid (hand +
  // deck). Permet à l'UI d'afficher coûts/stats modifiés.
  cardBuffs?: Record<
    string,
    {
      powerDelta: number;
      healthDelta: number;
      costDelta: number;
      addKeywords: string[];
    }
  >;
};

export type RuneterraAttackLane = {
  attackerUid: string;
  blockerUid: string | null;
  // Phase 3.18 : Challenger — l'attaquant force quelle unité ennemie peut
  // bloquer cette lane. null = pas de force (le défenseur choisit librement).
  forcedBlockerUid?: string | null;
};

export type RuneterraBattleState = {
  roomId: string;
  phase: RuneterraBattlePhase;
  // Toujours envoyé depuis la perspective du destinataire : self = vous.
  self: RuneterraSelfState | null;
  opponent: RuneterraPlayerPublicState | null;
  selfSeat: RuneterraSeatId | null;
  activeSeat: RuneterraSeatId | null; // qui a la priorité
  attackTokenSeat: RuneterraSeatId | null; // qui peut déclarer l'attaque ce round
  // Attaque en cours (null si pas d'attaque). attackerSeat = qui attaque,
  // lanes = liste ordonnée des paires attaquant→bloqueur (le bloqueur est
  // null tant que le défenseur n'a pas assigné).
  attackInProgress: {
    attackerSeat: RuneterraSeatId;
    lanes: RuneterraAttackLane[];
  } | null;
  round: number;
  winner: RuneterraSeatId | null;
  log: string[]; // 20 derniers évènements
};

export const RUNETERRA_BATTLE_CONFIG = {
  initialNexusHealth: 20,
  deckSize: 40,
  initialHandSize: 4,
  maxMana: 10,
  maxSpellMana: 3,
  maxHand: 10,
  maxBench: 6,
} as const;

// Messages échangés sur le WebSocket de la salle de combat LoR.
export type RuneterraBattleClientMessage =
  | { type: "lor-mulligan"; replaceIndices: number[] }
  | { type: "lor-play-unit"; handIndex: number }
  | {
      type: "lor-play-spell";
      handIndex: number;
      // Phase 3.7 : uid d'unité ciblée (allié ou ennemi selon le sort) ou
      // null pour les sorts sans cible. Phase 3.41 ajoutera nexus targets.
      targetUid?: string | null;
      // Phase 3.37 : 2e cible pour les sorts multi-target (Vents mordants
      // gel 2 ennemis, Transfusion dmg ally + buff ally, etc.).
      // Doit être distinct de targetUid pour les effets « 2 unités ».
      targetUid2?: string | null;
    }
  | {
      type: "lor-declare-attack";
      attackerUids: string[];
      // Phase 3.18 : tableau parallèle aux attackerUids. Pour les unités
      // avec Challenger, l'attaquant peut désigner quelle unité ennemie
      // doit bloquer (null sinon).
      forcedBlockerUids?: (string | null)[];
    }
  | { type: "lor-assign-blockers"; blockerUids: (string | null)[] }
  | { type: "lor-pass" }
  | { type: "lor-concede" };

export type RuneterraBattleServerMessage =
  | {
      type: "lor-battle-welcome";
      selfId: string;
      selfSeat: RuneterraSeatId | null;
    }
  | { type: "lor-battle-state"; state: RuneterraBattleState }
  | { type: "lor-battle-error"; message: string };

// ─── Effets de sorts LoR (Phase 3.7) ─────────────────────────────────────
// Registry partagé serveur+client : le client connaît les effets pour
// piloter le mode targeting (savoir quel côté est valide), le serveur
// résout l'effet via runeterra-engine.applySpellEffect.

export type SpellEffect =
  // Phase 3.7
  | { type: "buff-ally-round"; power: number; health: number }
  | { type: "grant-keyword-ally"; keyword: string }
  | { type: "deal-damage-anywhere"; amount: number }
  // Phase 3.8c (étendu Phase 3.17)
  | {
      type: "buff-ally-permanent";
      power: number;
      health: number;
      requireWounded?: boolean;
      // Phase 3.17 : ne marche que si le banc du caster a exactement N
      // allié(s) (Seul contre tous : exactement 1 allié).
      requireExactBenchSize?: number;
    }
  | { type: "grant-keyword-ally-round"; keyword: string }
  | { type: "frostbite-enemy"; maxHealth?: number }
  // Phase 3.9a
  // Sans cible : dégâts directs au nexus ennemi (ex Décimation).
  | { type: "deal-damage-enemy-nexus"; amount: number }
  // Cible : unité de l'un ou l'autre côté, retirée du board (kill).
  // maxPower optionnel (Phase 3.16) : ne tue que si la cible a une
  // puissance ≤ ce seuil (ex Abattage : ≤ 3 puissance).
  | { type: "kill-target-any"; maxPower?: number }
  // Cible : allié blessé OU son propre nexus → soigne X PV (allié = damage,
  // nexus = nexusHealth + X capé à initial).
  | { type: "heal-ally-or-nexus"; amount: number }
  // Phase 3.11
  // Cible : allié sur ton banc → retourne dans ta main (cancel summon).
  | { type: "recall-ally" }
  // Cible : unité de l'un ou l'autre côté → retourne dans la main du
  // propriétaire. Compteur enemyStunned (Yasuo) incrémenté pour le caster.
  | { type: "recall-any" }
  // Cible : unité ennemie → étourdie pour le round (ne peut pas attaquer
  // ni bloquer). Compteur enemyStunned (Yasuo) incrémenté.
  | { type: "stun-enemy" }
  // Phase 3.14
  // Cible : allié → +power/+health pour ce round + grant un mot-clé pour
  // ce round (Rush = +1/+0 QuickStrike, Riposte = +3/+0 Barrier, Marque
  // des Îles = +2/+2 Ephemeral).
  | {
      type: "combo-buff-keyword-ally-round";
      power: number;
      health: number;
      keyword: string;
    }
  // Sans cible : tue toutes les unités des 2 côtés (Last Breath déclenché
  // pour chaque). « La Ruine » board wipe.
  | { type: "kill-all-units" }
  // Sans cible : inflige X dégâts à toutes les unités ennemies + heal le
  // nexus du caster (Faible gémissement). Cumule plusieurs effets.
  | {
      type: "damage-all-enemies-heal-nexus";
      damageAmount: number;
      healAmount: number;
    }
  // Sans cible : grant un mot-clé pour ce round à TOUS les alliés sur
  // le banc (En garde = Challenger).
  | { type: "grant-keyword-all-allies-round"; keyword: string }
  // Phase 3.16
  // Cible : allié → grant plusieurs mots-clés pour ce round (Refuge
  // spirituel = Barrier + Lifesteal). Évite la combinatoire de variantes
  // pour chaque combo de keywords.
  | { type: "grant-keywords-ally-round"; keywords: string[] }
  // Phase 3.17
  // Sans cible : inflige X dégâts à TOUTES les unités des 2 côtés
  // (Avalanche). Last Breath déclenché pour chaque mort.
  | { type: "damage-all-units"; amount: number }
  // Sans cible : le caster gagne (ou regagne) le jeton d'attaque ce round
  // (Poursuite inlassable = Ralliez-vous).
  | { type: "gain-attack-token-self" }
  // Phase 3.20
  // Cible : adepte ennemi (non-Champion) → supprime tous ses mots-clés
  // et ses buffs round (frozen / stunned / barrier / endOfRoundBuffs).
  // Purification (01DE050) : ne marche que sur un adepte.
  | { type: "silence-follower-target" }
  // Phase 3.23
  // Cible : allié → soigne entièrement (damage = 0). Regain de courage.
  | { type: "heal-ally-full" }
  // Sans cible : +power/+health pour ce round + grant un mot-clé pour ce
  // round à TOUS les alliés sur le banc (Esprit de meute = +2/+2 Overwhelm).
  | {
      type: "combo-buff-keyword-all-allies-round";
      power: number;
      health: number;
      keyword: string;
    }
  // Phase 3.24
  // Drain : inflige X dégâts à la cible et soigne le nexus du caster du
  // même montant (capé à la valeur initiale du nexus).
  // drain-target-any → any side (Poigne de l'immortel).
  // drain-ally       → ally side seulement (Absorbe-âme).
  | { type: "drain-target-any"; amount: number }
  | { type: "drain-ally"; amount: number }
  // Phase 3.25
  // Sans cible : pioche le 1er champion trouvé dans le deck du caster
  // (Haro). Si aucun champion → no-op silencieux.
  | { type: "draw-champion" }
  // Sans cible : étourdit tous les ennemis dont la puissance est ≤ N
  // (Rugissement intimidant : ≤ 4). enemyStunned bumpé pour chaque cible.
  | { type: "stun-all-enemies-max-power"; maxPower: number }
  // Phase 3.26
  // Sans cible : invoque N copies du token cardCode sur le banc du caster
  // (capé à maxBench). Pour Gadget de bric et de brac (01PZ057) et
  // Relique hantée (01SI007).
  | { type: "summon-tokens"; cardCode: string; count: number }
  // Phase 3.27
  // Cible : allié → tué (Last Breath déclenché) puis caster pioche
  // drawCount cartes. Aperçu de l'au-delà (01SI049 : 2 cartes).
  | { type: "kill-ally-for-draw"; drawCount: number }
  // Phase 3.30
  // Sans cible : +power/+health pour ce round à TOUS les alliés sur le
  // banc (sans grant keyword). Buff all-board pour ce round seulement.
  | { type: "buff-all-allies-round"; power: number; health: number }
  // Phase 3.32
  // Sans cible : inflige X dégâts à toutes les unités au combat (côté
  // attaquant et bloqueur). No-op si pas d'attaque en cours.
  | { type: "damage-all-combatants"; amount: number }
  // Phase 3.33
  // Cible : allié → invoque count copies sur le banc du caster. Override
  // optionnel des stats (Âme scindée : 1|1) et add keywords (Ephemeral).
  // Capé à maxBench. Si pas de slots → invoque autant que possible.
  | {
      type: "summon-ally-copies";
      count: number;
      powerOverride?: number;
      healthOverride?: number;
      addKeywords?: string[];
    }
  // Phase 3.34 + 3.50
  // Sans cible : invoque count tokens SI alliesDiedThisRound >= minDeaths
  // (par défaut 1). Sinon no-op. minDeaths permet à 01SI027 (Offrandes
  // fraîches) d'exiger 3 morts au lieu de 1 (01SI036).
  | {
      type: "summon-tokens-if-ally-died";
      cardCode: string;
      count: number;
      minDeaths?: number;
    }
  // Cible : unité (any) → inflige amount dmg SI au moins un allié est
  // mort pendant ce round. Sinon no-op (et ok côté serveur).
  | { type: "deal-damage-anywhere-if-ally-died"; amount: number }
  // Phase 3.37 — Multi-target effects (2 cibles distinctes).
  // 2 ennemis : freeze chacun (Vents mordants).
  | { type: "frostbite-2-enemies" }
  // 2 alliés : +power/+health round à chacun (utilisé par 01DE041).
  | { type: "buff-2-allies-round"; power: number; health: number }
  // 2 alliés : +power/+health permanent (01NX025 +2|+0, 01FR010 +0|+3).
  | { type: "buff-2-allies-permanent"; power: number; health: number }
  // Cible 1 = allié pris en dmg, cible 2 = allié buffé round (Transfusion).
  // Distinct (target1 ≠ target2).
  | {
      type: "damage-ally-buff-other-ally-round";
      damage: number;
      buffPower: number;
      buffHealth: number;
    }
  // Phase 3.41 — Nexus targeting.
  // Cible : unité (any side) OU nexus (self/enemy). Convention sur targetUid :
  // - uid d'unité réel = cible unité
  // - "nexus-self" = nexus du caster
  // - "nexus-enemy" = nexus adverse
  // Tir mystique (01PZ052), Enthousiasme (01PZ039), etc.
  | { type: "deal-damage-target-any-or-nexus"; amount: number }
  // Phase 3.42 — Combination effects.
  // Cible : allié → heal damage de healAmount + caster pioche drawCount.
  // Rituel du renouveau (01IO001 : 4 + 1).
  | {
      type: "heal-ally-and-draw";
      healAmount: number;
      drawCount: number;
    }
  // Cible : ennemi → étourdit + +power/+health round à tous les alliés du
  // caster. Manœuvre décisive (01NX013 : stun + +2|+0).
  | {
      type: "stun-enemy-buff-all-allies-round";
      power: number;
      health: number;
    }
  // Cible : unité (any) → drain drainAmount PV (heal nexus du caster) puis
  // summon 1 × token. Vil festin (01SI040 : 1 + Jeune araignée 01SI002).
  | {
      type: "drain-target-summon-token";
      drainAmount: number;
      tokenCardCode: string;
    }
  // Phase 3.44
  // Cible : ennemi → inflige amount dmg puis rally (gain attack token).
  // Shunpo (01NX056 : 2 dmg + rally).
  | { type: "damage-enemy-and-rally"; amount: number }
  // Phase 3.45
  // Cible : allié → recall (retire du banc, ajoute à la main) puis summon
  // 1 × token sur le banc (slot du recall). Inversion spectrale.
  | {
      type: "recall-ally-and-summon-token";
      tokenCardCode: string;
    }
  // Cible : ennemi → SI sa puissance est 0 (ex frozen), inflige amount
  // dmg ; sinon le gèle. Acier glacial (01FR055 : 4 dmg or freeze).
  | { type: "damage-or-frostbite-by-power-zero"; amount: number }
  // Sans cible : tue tous les ennemis avec puissance = 0, puis gèle tous
  // les ennemis restants. Ours blanc (01FR019).
  | { type: "kill-power-zero-and-frostbite-all-enemies" }
  // Phase 3.46
  // 2 cibles : target1 = allié, target2 = ennemi. Les 2 se frappent
  // mutuellement (dégâts simultanés = power de l'autre). Combat singulier.
  | { type: "unit-strike-unit" }
  // Phase 3.47
  // Comme unit-strike-unit mais target1 + target2 doivent être au combat
  // (uid présent dans state.attackInProgress.lanes). Volée mortelle.
  | { type: "unit-strike-unit-in-combat" }
  // Phase 3.48
  // Cible : 1 allié au combat → frappe tous les ennemis au combat (dmg
  // simultanés sur chacun = power de l'allié, l'allié reçoit la somme
  // des power des ennemis touchés). Jugement.
  | { type: "ally-strikes-all-enemies-in-combat" }
  // Phase 3.49
  // 2 cibles : target1 = allié AVEC Ephemeral, target2 = ennemi.
  // Retire Ephemeral de target1, l'ajoute à target2. Marque de la mort.
  | { type: "swap-ephemeral" }
  // Phase 3.51
  // Sans cible : pick un allié mort ce round (au hasard) et le ramène
  // sur le banc avec ses stats de base. Appel de la brume (01SI046).
  // No-op si deadAlliesThisRound vide ou banc plein.
  | { type: "revive-random-dead-ally-this-round" }
  // Phase 3.52
  // Cible : ennemi → stun, MAIS uniquement s'il est attaquant (uid dans
  // attackInProgress.lanes côté attacker). Tempête d'acier (01IO046).
  | { type: "stun-attacker-enemy" }
  // Sans cible : grant Ephemeral à TOUS les adeptes (non-Champion) au
  // combat (les 2 côtés). Obscure lueur (01IO047).
  | { type: "grant-ephemeral-all-followers-in-combat" }
  // Phase 3.53
  // Sans cible : summon count tokens + buff permanent +pwr/+hp à TOUS
  // les alliés du subtype donné (incluant les nouveaux). 01SI050 (3 ×
  // Jeune araignée + buff araignées), 01DE014 (2 × Détachement + buff
  // élites).
  | {
      type: "summon-tokens-and-buff-subtype-allies";
      tokenCardCode: string;
      count: number;
      subtype: string;
      power: number;
      health: number;
    }
  // Sans cible : si le caster a un allié de power ≥ minAllyPower, tue
  // toutes les unités (2 côtés) avec power ≤ maxPower. 01NX053.
  | {
      type: "kill-all-units-with-max-power-if-ally-min-power";
      maxPower: number;
      minAllyPower: number;
    }
  // 2 cibles allié : grant un mot-clé pour ce round à 2 alliés distincts.
  // 01IO010 Soutien indéfectible (Barrier round à 2 alliés).
  | { type: "grant-keyword-2-allies-round"; keyword: string }
  // Phase 3.54 — Hand-buff effects.
  // Sans cible : +pwr/+hp permanent à toutes les unités alliées de la
  // main (cardBuffs). 01IO029 Graines semées (+1|+0 hand).
  | { type: "buff-allies-in-hand-permanent"; power: number; health: number }
  // Sans cible : -delta cost à toutes les cartes alliées de la main.
  // 01DE019 Mobilisation (-1 hand).
  | { type: "reduce-cost-allies-in-hand"; delta: number }
  // Cible : allié de la MAIN → grant keyword (cardBuff) puis pioche
  // drawCount. 01IO055 Gardien du Ki (Barrier hand + draw 1).
  // Convention pour cet effet : targetUid est un uid de carte de la
  // main (pas un uid de banc).
  | {
      type: "grant-keyword-ally-in-hand-and-draw";
      keyword: string;
      drawCount: number;
    }
  // Sans cible : +pwr/+hp permanent à toutes les unités alliées du
  // subtype donné (bench + hand + deck via cardBuffs). 01FR016 Poro-
  // Snax (+1|+1 Poros).
  | {
      type: "buff-allies-of-subtype-everywhere";
      subtype: string;
      power: number;
      health: number;
    }
  // Sans cible : pioche drawCount cartes ET applique -delta cost à ces
  // cartes (cardBuffs). 01PZ049 Inventeur génial.
  | {
      type: "draw-and-reduce-cost";
      drawCount: number;
      delta: number;
    }
  // Phase 3.55 — Discard mechanic + 01NX039 cast portion.
  // Sans cible : +pwr/+hp permanent à TOUS les alliés sur le banc.
  // 01NX039 (cast portion ; le trigger « si défaussé » est TODO).
  | { type: "buff-all-allies-permanent"; power: number; health: number }
  // Sans cible : auto-discard up to maxDiscard cartes (rightmost first
  // par défaut, heuristique simple) puis pioche autant qu'on a discarded.
  // 01PZ001 Fouillis.
  | { type: "auto-discard-and-draw-up-to-n"; maxDiscard: number }
  // Cible : unité ou nexus → auto-discard 1 carte (rightmost) puis dmg
  // amount à la cible. 01PZ039 Enthousiasme.
  | {
      type: "auto-discard-and-damage-target-any-or-nexus";
      amount: number;
    }
  // Phase 3.56 — Hand-card creation.
  // Cible : unité blessée (any side) → tuée + un sort spellCardCode est
  // créé dans la main du caster. 01NX022 Guillotine noxienne (créé une
  // copie de soi en main).
  | {
      type: "kill-wounded-target-and-create-spell-in-hand";
      spellCardCode: string;
    }
  // Cible : adepte allié → inflige damage. S'il survit, crée une copie
  // de lui (cardCode) dans la main. 01NX052 Sang pour sang.
  | {
      type: "damage-ally-create-copy-in-hand-if-survives";
      damage: number;
    }
  // Cible : adepte (any side) → crée une copie dans la main du caster
  // avec un cardBuff Ephemeral (la copie sera Ephemeral quand jouée).
  // 01SI047 Vagues souvenirs.
  | { type: "create-ephemeral-copy-of-target-in-hand" }
  // Phase 3.57 — Random spell creation.
  // Sans cible : crée dans la main du caster un sort aléatoire venant
  // d'une région du deck du caster. Filtres optionnels : minCost
  // (01PZ016 ≥ 6), restoreSpellMana (01PZ016 fill gems).
  | {
      type: "create-random-spell-in-hand-from-regions";
      minCost?: number;
      restoreSpellMana?: boolean;
    }
  // Phase 3.58 — Counter-based conditional summons.
  // Sans cible : invoque un adepte (non-Champion) aléatoire collectible
  // de la région et cost donnés. 01DE033 (Demacia, cost 5).
  | {
      type: "summon-random-adept-from-region-cost";
      region: string;
      cost: number;
    }
  // Sans cible : si caster a joué ≥ minUnique cardCodes uniques cette
  // partie, summon 1 × tokenCardCode. 01PZ033 Chatastrophe (≥ 20).
  | {
      type: "summon-token-if-unique-cards-played-min";
      tokenCardCode: string;
      minUnique: number;
    }
  // Sans cible : si caster a un allié de subtype donné, summon 1 ×
  // tokenCardCode. Sinon ajoute le token au sommet du deck. 01FR051.
  | {
      type: "summon-token-or-add-to-deck-if-no-subtype-ally";
      tokenCardCode: string;
      subtype: string;
    }
  // Phase 3.59
  // 2 cibles : target1 = allié à sacrifier, target2 = unité ou nexus.
  // Tue target1 puis inflige dmg = target1.power à target2. Atrocité.
  | { type: "kill-ally-deal-power-to-target-any-or-nexus" }
  // Cible : allié → buff +pwr/+hp permanent à la cible ET à toutes ses
  // copies (même cardCode) sur le banc, dans la main et dans le deck.
  // 01FR006 (+2|+2 ally + copies).
  | {
      type: "buff-ally-and-copies-everywhere-permanent";
      power: number;
      health: number;
    }
  // Phase 3.60
  // Sans cible : pick les count cardCodes les plus puissants dans
  // deadAlliesThisGame (par card.attack), summon chacun avec keyword
  // Ephemeral. Capé à maxBench. 01SI003 La Nuit de l'horreur (count=6).
  | {
      type: "revive-n-most-powerful-dead-allies-this-game-as-ephemeral";
      count: number;
    }
  // Phase 3.61
  // Sans cible : caster gagne 1 mana slot permanent (manaSlotsBonus +1)
  // + heal nexus de healAmount. 01FR012 Catalyseur de l'éternité.
  | { type: "gain-mana-slot-and-heal-nexus"; healAmount: number }
  // Cible : unité (any) → caster paie tout son mana (mana + spellMana)
  // pour infliger ce montant en dmg. 01PZ027 Rayon thermogénique.
  | { type: "pay-all-mana-deal-damage-target-any" }
  // Sans cible : amount dmg à toutes les unités ennemies summoned ce
  // round (uid présent dans opp.summonedUidsThisRound). 01SI019 La cage.
  | { type: "damage-summoned-this-round-enemies"; amount: number }
  // Phase 3.62
  // Sans cible : pick le card de plus haut cost dans la main du caster
  // (excluant le sort lui-même), crée copyCount copies dans son deck à
  // des positions aléatoires. 01PZ046 Contrefaçons.
  | { type: "auto-copy-best-hand-card-into-deck"; copyCount: number }
  // Cible : adepte ennemi → vole vers le banc du caster jusqu'à fin de
  // round (restoré au startRound suivant via stolenUidsThisRound).
  // Injouable si banc plein. 01SI006 Possession (allowChampion=false).
  // Phase 3.63 : 01DE025 Capture (allowChampion=true) — pareil sans
  // restriction Champion.
  | { type: "steal-enemy-adept-this-round"; allowChampion?: boolean }
  // Phase 3.63
  // 2 cibles : target1 = allié, target2 = unité (ally ou enemy, pas
  // nexus). Remplace target1 par une copie exacte de target2 (cardCode
  // + stats reset au card de base, keywords du nouveau cardCode).
  // 01PZ005 Transformer.
  | { type: "transform-target-into-other-target" };

export const RUNETERRA_SPELL_EFFECTS: Record<string, SpellEffect> = {
  // ── Demacia
  // Cotte de mailles (1 mana, Burst) : « Octroyez Robuste à un allié. »
  "01DE013": { type: "grant-keyword-ally", keyword: "Tough" },
  // Frappe rayonnante (1 mana, Burst) :
  // « Conférez +1|+1 à un allié pour ce round. »
  "01DE018": { type: "buff-ally-round", power: 1, health: 1 },
  // Barrière prismatique (3 mana, Burst) :
  // « Conférez Barrière à un allié pour ce round. »
  "01DE032": { type: "grant-keyword-ally-round", keyword: "Barrier" },

  // ── Freljord
  // Élixir de fer (1 mana, Burst) :
  // « Conférez +0|+2 à un allié pour ce round. »
  "01FR004": { type: "buff-ally-round", power: 0, health: 2 },
  // Engelure (3 mana, Burst) : « Gelez un ennemi. »
  "01FR001": { type: "frostbite-enemy" },
  // Acier cassant (1 mana, Burst) : « Gelez un ennemi ayant 3 PV ou moins. »
  "01FR030": { type: "frostbite-enemy", maxHealth: 3 },
  // Courage (3 mana, Burst) : « Octroyez +3|+3 à un allié blessé. »
  "01FR046": {
    type: "buff-ally-permanent",
    power: 3,
    health: 3,
    requireWounded: true,
  },

  // ── Noxus (Phase 3.9a)
  // Élixir de rage (1 mana, Burst) :
  // « Conférez +3|+0 à un allié pour ce round. »
  "01NX027": { type: "buff-ally-round", power: 3, health: 0 },
  // Décimation (6 mana, Slow) :
  // « Infligez 4 pt(s) de dégâts au Nexus ennemi. »
  "01NX002": { type: "deal-damage-enemy-nexus", amount: 4 },

  // ── Piltover & Zaun (Phase 3.9a)
  // Carte du Puisard (2 mana, Burst) :
  // « Octroyez Insaisissable à un allié. »
  "01PZ026": { type: "grant-keyword-ally", keyword: "Elusive" },

  // ── Ionia (Phase 3.9a)
  // Fantôme (1 mana, Burst) :
  // « Conférez Insaisissable à un allié pour ce round. »
  "01IO022": { type: "grant-keyword-ally-round", keyword: "Elusive" },
  // Potion de soin (1 mana, Burst) :
  // « Soignez un allié ou votre Nexus de 3 PV. »
  "01IO004": { type: "heal-ally-or-nexus", amount: 3 },

  // ── Îles obscures (Phase 3.9a)
  // Vengeance (6 mana, Slow) : « Tuez une unité. »
  "01SI001": { type: "kill-target-any" },

  // ── Ionia (Phase 3.11)
  // Rappel (1 mana, Burst) : « Rappelez un allié. »
  "01IO011": { type: "recall-ally" },
  // Volonté d'Ionia (4 mana, Burst) : « Rappelez une unité. »
  "01IO002": { type: "recall-any" },

  // ── Phase 3.14 : combos + AOE
  // Rush (Ionia, 1 mana, Burst) :
  // « Conférez +1|+0 et Frappe rapide à un allié pour ce round. »
  "01IO018": {
    type: "combo-buff-keyword-ally-round",
    power: 1,
    health: 0,
    keyword: "QuickStrike",
  },
  // Riposte (Demacia, 4 mana, Burst) :
  // « Conférez +3|+0 et Barrière à un allié pour ce round. »
  "01DE037": {
    type: "combo-buff-keyword-ally-round",
    power: 3,
    health: 0,
    keyword: "Barrier",
  },
  // Marque des Îles (SI, 1 mana, Burst) :
  // « Octroyez +2|+2 et Éphémère à un allié. »
  "01SI022": {
    type: "combo-buff-keyword-ally-round",
    power: 2,
    health: 2,
    keyword: "Ephemeral",
  },
  // La Ruine (SI, 9 mana, Slow) : « Tuez TOUTES les unités. »
  "01SI015": { type: "kill-all-units" },
  // En garde (Demacia, 2 mana, Burst) :
  // « Conférez Challenger aux alliés pour ce round. »
  "01DE027": {
    type: "grant-keyword-all-allies-round",
    keyword: "Challenger",
  },
  // Faible gémissement (SI, 4 mana, Slow) :
  // « Infligez 1 pt(s) de dégâts à tous les ennemis. Soignez votre
  //   Nexus de 3 PV. »
  "01SI029": {
    type: "damage-all-enemies-heal-nexus",
    damageAmount: 1,
    healAmount: 3,
  },

  // ── Phase 3.16
  // Abattage (Noxus, 3 mana, Slow) :
  // « Tuez une unité dotée d'une puissance de 3 ou moins. »
  "01NX004": { type: "kill-target-any", maxPower: 3 },
  // Refuge spirituel (Ionia, 4 mana, Burst) :
  // « Conférez Barrière et Vol de vie à un allié pour ce round. »
  "01IO037": {
    type: "grant-keywords-ally-round",
    keywords: ["Barrier", "Lifesteal"],
  },

  // ── Phase 3.17
  // Avalanche (Freljord, 4 mana, Slow) :
  // « Infligez 2 pt(s) de dégâts à TOUTES les unités. »
  "01FR020": { type: "damage-all-units", amount: 2 },
  // Poursuite inlassable (Demacia, 4 mana, Slow) : « Ralliez-vous. »
  "01DE021": { type: "gain-attack-token-self" },
  // Seul contre tous (Demacia, 4 mana, Burst) :
  // « Si vous avez exactement 1 allié, octroyez-lui +3|+3. »
  "01DE017": {
    type: "buff-ally-permanent",
    power: 3,
    health: 3,
    requireExactBenchSize: 1,
  },

  // ── Phase 3.20
  // Purification (Demacia, 2 mana, Burst) :
  // « Réduisez au silence un adepte. »
  "01DE050": { type: "silence-follower-target" },

  // ── Phase 3.23
  // Puissance (Noxus, 3 mana, Burst) :
  // « Conférez +3|+0 et Surpuissance à un allié pour ce round. »
  "01NX019": {
    type: "combo-buff-keyword-ally-round",
    power: 3,
    health: 0,
    keyword: "Overwhelm",
  },
  // Regain de courage (Demacia, 6 mana, Slow) :
  // « Soignez entièrement un allié. »
  "01DE044": { type: "heal-ally-full" },
  // Esprit de meute (Freljord, 7 mana, Slow) :
  // « Conférez +2|+2 et Surpuissance aux alliés pour ce round. »
  "01FR057": {
    type: "combo-buff-keyword-all-allies-round",
    power: 2,
    health: 2,
    keyword: "Overwhelm",
  },

  // ── Phase 3.24 (drain)
  // Poigne de l'immortel (ShadowIsles, 5 mana, Fast) :
  // « Drainez 3 PV d'une unité. »
  "01SI054": { type: "drain-target-any", amount: 3 },
  // Absorbe-âme (ShadowIsles, 1 mana, Fast) :
  // « Drainez 4 PV d'un allié. »
  "01SI045": { type: "drain-ally", amount: 4 },

  // ── Phase 3.25
  // 01FR029 (Haro, Freljord, 2 Burst) — pioche un champion.
  "01FR029": { type: "draw-champion" },
  // 01NX054 (Rugissement intimidant, Noxus, 5 Slow) — stun ennemis ≤ 4.
  "01NX054": { type: "stun-all-enemies-max-power", maxPower: 4 },

  // ── Phase 3.26 (token summons)
  // 01PZ057 (Gadget de bric et de brac, PiltoverZaun, 2 Slow) — summon
  // 2 × Carapateur ferrailleur (token 01PZ032, 1|1).
  "01PZ057": { type: "summon-tokens", cardCode: "01PZ032", count: 2 },
  // 01SI007 (Relique hantée, ShadowIsles, 2 Slow) — summon 3 × Esprit
  // déchaîné (token 01SI007T1, 1|1 Ephemeral).
  "01SI007": { type: "summon-tokens", cardCode: "01SI007T1", count: 3 },

  // ── Phase 3.27
  // 01SI049 (Aperçu de l'au-delà, ShadowIsles, 2 Fast) — sacrifice un
  // allié (Last Breath déclenché) pour piocher 2 cartes.
  "01SI049": { type: "kill-ally-for-draw", drawCount: 2 },

  // ── Phase 3.29 (réutilisation d'effets existants)
  // 01NX049 (Étourdir, Noxus, 1 Slow) — stun ennemi simple.
  "01NX049": { type: "stun-enemy" },
  // 01PZ050 (Statikk, PiltoverZaun, 3 Burst) — combo +4|+0 + QuickStrike.
  "01PZ050": {
    type: "combo-buff-keyword-ally-round",
    power: 4,
    health: 0,
    keyword: "QuickStrike",
  },
  // 01FR005 (Buff massif, Freljord, 8 Burst) — buff permanent +8|+4.
  "01FR005": { type: "buff-ally-permanent", power: 8, health: 4 },
  // 01NX043 (Tir noxien, Noxus, 1 Fast) — 1 dmg n'importe quelle unité.
  "01NX043": { type: "deal-damage-anywhere", amount: 1 },
  // 01SI010 (Cavaliers spectraux, ShadowIsles, 2 Slow) — summon 2 ×
  // token 01SI024 (Cavalier spectral, 2|2 Ephemeral).
  "01SI010": { type: "summon-tokens", cardCode: "01SI024", count: 2 },

  // ── Phase 3.30
  // 01DE035 (Demacia, 6 Slow) — +3|+3 à tous les alliés pour ce round
  // (pas de grant keyword, juste le buff stat).
  "01DE035": { type: "buff-all-allies-round", power: 3, health: 3 },

  // ── Phase 3.31
  // 01PZ014 (PiltoverZaun, 6 Slow) — summon 1 × token 01PZ014T1
  // (Gadget illégal, 5|5).
  "01PZ014": { type: "summon-tokens", cardCode: "01PZ014T1", count: 1 },

  // ── Phase 3.32
  // 01NX050 (Noxus, 2 Fast) — 1 dmg à toutes les unités au combat
  // (attaquants + bloqueurs). No-op hors combat.
  "01NX050": { type: "damage-all-combatants", amount: 1 },

  // ── Phase 3.33
  // 01SI028 (ShadowIsles, 3 Slow) — invoque 1 copie d'un allié avec
  // stats overrides à 1|1 et keyword Ephemeral.
  "01SI028": {
    type: "summon-ally-copies",
    count: 1,
    powerOverride: 1,
    healthOverride: 1,
    addKeywords: ["Ephemeral"],
  },
  // 01IO024 (Ionia, 6 Slow) — invoque 2 copies d'un allié avec keyword
  // Ephemeral (stats originaux conservés).
  "01IO024": {
    type: "summon-ally-copies",
    count: 2,
    addKeywords: ["Ephemeral"],
  },

  // ── Phase 3.34 (conditional)
  // 01SI036 (ShadowIsles, 1 Slow) — si un allié est mort ce round,
  // summon 2 × token 01SI002 (Jeune araignée, 1|1).
  "01SI036": {
    type: "summon-tokens-if-ally-died",
    cardCode: "01SI002",
    count: 2,
  },
  // 01SI034 (ShadowIsles, 3 Fast) — si un allié est mort ce round,
  // inflige 4 dmg à une unité (any).
  "01SI034": { type: "deal-damage-anywhere-if-ally-died", amount: 4 },

  // ── Phase 3.36
  // 01PZ028 (PiltoverZaun, 1 Burst) — au cast, summon 1 × token 01PZ032
  // (Carapateur ferrailleur, 1|1). La branche « si défaussé » n'est pas
  // implémentée (pas de système de défausse encore).
  "01PZ028": { type: "summon-tokens", cardCode: "01PZ032", count: 1 },

  // ── Phase 3.38 (multi-target)
  // 01FR042 (Freljord, 5 Burst) — gel 2 ennemis distincts.
  "01FR042": { type: "frostbite-2-enemies" },
  // 01NX025 (Noxus, 2 Burst) — +2|+0 permanent à 2 alliés distincts.
  "01NX025": { type: "buff-2-allies-permanent", power: 2, health: 0 },
  // 01FR010 (Freljord, 4 Burst) — +0|+3 permanent à 2 alliés distincts.
  "01FR010": { type: "buff-2-allies-permanent", power: 0, health: 3 },
  // 01DE041 (Demacia, 6 Burst) — +3|+3 round à 2 alliés distincts.
  "01DE041": { type: "buff-2-allies-round", power: 3, health: 3 },
  // 01NX047 (Noxus, 2 Burst, Transfusion) — 1 dmg à allié1, +2|+2 round
  // à allié2. Cibles distinctes.
  "01NX047": {
    type: "damage-ally-buff-other-ally-round",
    damage: 1,
    buffPower: 2,
    buffHealth: 2,
  },

  // ── Phase 3.41 (nexus targeting)
  // 01PZ052 (PiltoverZaun, 2 Fast, Tir mystique) — 2 dmg à n'importe
  // quelle cible (unité ou nexus, des 2 côtés).
  "01PZ052": { type: "deal-damage-target-any-or-nexus", amount: 2 },

  // ── Phase 3.42 (combination effects)
  // 01IO001 (Ionia, 4 Burst) — heal 4 ally + draw 1.
  "01IO001": { type: "heal-ally-and-draw", healAmount: 4, drawCount: 1 },
  // 01NX013 (Noxus, 5 Fast) — stun ennemi + +2|+0 round à tous les alliés.
  "01NX013": {
    type: "stun-enemy-buff-all-allies-round",
    power: 2,
    health: 0,
  },
  // 01SI040 (ShadowIsles, 2 Fast) — drain 1 unité + summon Jeune araignée.
  "01SI040": {
    type: "drain-target-summon-token",
    drainAmount: 1,
    tokenCardCode: "01SI002",
  },

  // ── Phase 3.44
  // 01DE047 (Demacia, 3 Slow) — summon 1 × token 01DE016 (Détachement
  // hardi, 3|3).
  "01DE047": { type: "summon-tokens", cardCode: "01DE016", count: 1 },
  // 01NX056 (Noxus, 5 Slow, Shunpo) — 2 dmg ennemi + rally.
  "01NX056": { type: "damage-enemy-and-rally", amount: 2 },

  // ── Phase 3.45
  // 01IO039 (Ionia, 2 Fast, Inversion spectrale) — recall un allié et
  // summon 01IO009T1 (Ombre vivante, 3|2) à sa place.
  "01IO039": {
    type: "recall-ally-and-summon-token",
    tokenCardCode: "01IO009T1",
  },
  // 01FR055 (Freljord, 1 Slow) — si l'ennemi a power=0, 4 dmg, sinon gel.
  "01FR055": { type: "damage-or-frostbite-by-power-zero", amount: 4 },
  // 01FR019 (Freljord, 7 Slow, Ours blanc) — kill all enemies power=0
  // puis freeze tous les ennemis restants.
  "01FR019": { type: "kill-power-zero-and-frostbite-all-enemies" },

  // ── Phase 3.46
  // 01DE026 (Demacia, 2 Fast, Combat singulier) — 1 allié et 1 ennemi
  // se frappent mutuellement (dmg simultanés = power de l'autre).
  "01DE026": { type: "unit-strike-unit" },

  // ── Phase 3.47
  // 01NX011 (Noxus, 3 Fast, Volée mortelle) — comme Combat singulier
  // mais target1 + target2 doivent être au combat.
  "01NX011": { type: "unit-strike-unit-in-combat" },

  // ── Phase 3.48
  // 01DE007 (Demacia, 8 Fast, Jugement) — un allié au combat frappe
  // tous les ennemis au combat.
  "01DE007": { type: "ally-strikes-all-enemies-in-combat" },

  // ── Phase 3.49
  // 01IO003 (Ionia, 3 Fast, Marque de la mort) — retire Ephemeral d'un
  // allié et l'octroie à un ennemi.
  "01IO003": { type: "swap-ephemeral" },

  // ── Phase 3.50
  // 01SI027 (ShadowIsles, 3 Slow, Offrandes fraîches) — si ≥ 3 alliés
  // sont morts ce round, summon 2 × 01SI002 (Jeune araignée).
  "01SI027": {
    type: "summon-tokens-if-ally-died",
    cardCode: "01SI002",
    count: 2,
    minDeaths: 3,
  },

  // ── Phase 3.51
  // 01SI046 (ShadowIsles, 3 Fast, Appel de la brume) — pick un allié
  // mort ce round (au hasard) et le ramène sur le banc.
  "01SI046": { type: "revive-random-dead-ally-this-round" },

  // ── Phase 3.52
  // 01IO012 (Ionia, 2 Burst, Maîtrises jumelles) — bot version : +3|+0
  // round par défaut (la version « +0|+3 OU +3|+0 » via choix UI sera
  // ajoutée plus tard si besoin).
  "01IO012": { type: "buff-ally-round", power: 3, health: 0 },
  // 01IO046 (Ionia, 2 Fast, Tempête d'acier) — étourdit un ennemi
  // attaquant (combat-only).
  "01IO046": { type: "stun-attacker-enemy" },
  // 01IO047 (Ionia, 6 Fast, Obscure lueur) — Ephemeral à TOUS les
  // adeptes au combat (les 2 côtés).
  "01IO047": { type: "grant-ephemeral-all-followers-in-combat" },

  // ── Phase 3.53
  // 01SI050 (ShadowIsles, 6 Slow) — summon 3 × 01SI002 (Jeune araignée)
  // + buff +1|+0 permanent à toutes les araignées alliées.
  "01SI050": {
    type: "summon-tokens-and-buff-subtype-allies",
    tokenCardCode: "01SI002",
    count: 3,
    subtype: "ARAIGNÉE",
    power: 1,
    health: 0,
  },
  // 01DE014 (Demacia, 8 Slow) — summon 2 × 01DE016 (Détachement hardi)
  // + buff +1|+1 permanent à tous les alliés ÉLITE.
  "01DE014": {
    type: "summon-tokens-and-buff-subtype-allies",
    tokenCardCode: "01DE016",
    count: 2,
    subtype: "ÉLITE",
    power: 1,
    health: 1,
  },
  // 01NX053 (Noxus, 7 Slow) — si caster a un allié power ≥ 5, kill
  // toutes les unités (2 côtés) avec power ≤ 4.
  "01NX053": {
    type: "kill-all-units-with-max-power-if-ally-min-power",
    maxPower: 4,
    minAllyPower: 5,
  },
  // 01IO010 (Ionia, 6 Burst, Soutien indéfectible) — grant Barrier round
  // à 2 alliés distincts (le « swap » est cosmétique en LoR).
  "01IO010": { type: "grant-keyword-2-allies-round", keyword: "Barrier" },

  // ── Phase 3.54 (hand-buff)
  // 01IO029 (Ionia, 2 Burst, Graines semées) — +1|+0 à toutes les
  // unités alliées en main (cardBuffs).
  "01IO029": { type: "buff-allies-in-hand-permanent", power: 1, health: 0 },
  // 01DE019 (Demacia, 3 Burst, Mobilisation) — -1 cost à toutes les
  // cartes alliées en main.
  "01DE019": { type: "reduce-cost-allies-in-hand", delta: 1 },
  // 01IO055 (Ionia, 2 Burst, Gardien du Ki) — Barrier à 1 unité de la
  // main + draw 1. Bot/UI : sans target picker, applique au 1er unit
  // de la main.
  "01IO055": {
    type: "grant-keyword-ally-in-hand-and-draw",
    keyword: "Barrier",
    drawCount: 1,
  },
  // 01FR016 (Freljord, 3 Burst, Poro-Snax) — +1|+1 à tous les Poros
  // alliés (bench + hand + deck).
  "01FR016": {
    type: "buff-allies-of-subtype-everywhere",
    subtype: "PORO",
    power: 1,
    health: 1,
  },
  // 01PZ049 (PiltoverZaun, 8 Burst) — pioche 3 + -1 cost aux 3 nouvelles.
  "01PZ049": { type: "draw-and-reduce-cost", drawCount: 3, delta: 1 },

  // ── Phase 3.55 (discard auto)
  // 01NX039 (Noxus, 3 Burst) — +1|+0 permanent à tous les alliés au cast.
  // (Le trigger « si défaussé » ne fait rien sans système de défausse.)
  "01NX039": { type: "buff-all-allies-permanent", power: 1, health: 0 },
  // 01PZ001 (PiltoverZaun, 2 Burst, Fouillis) — auto-discard up to 2
  // cartes (rightmost first) + draw égal au nombre discarded.
  "01PZ001": { type: "auto-discard-and-draw-up-to-n", maxDiscard: 2 },
  // 01PZ039 (PiltoverZaun, 3 Fast, Enthousiasme) — auto-discard 1
  // (rightmost) + 3 dmg à n'importe quelle cible (unité ou nexus).
  "01PZ039": {
    type: "auto-discard-and-damage-target-any-or-nexus",
    amount: 3,
  },

  // ── Phase 3.56 (hand-card creation)
  // 01NX022 (Noxus, 3 Fast, Guillotine noxienne) — kill une unité
  // blessée (any side) + crée 1 copie de soi dans la main du caster.
  "01NX022": {
    type: "kill-wounded-target-and-create-spell-in-hand",
    spellCardCode: "01NX022",
  },
  // 01NX052 (Noxus, 2 Burst, Sang pour sang) — 1 dmg à un adepte allié.
  // S'il survit, crée une copie en main.
  "01NX052": {
    type: "damage-ally-create-copy-in-hand-if-survives",
    damage: 1,
  },
  // 01SI047 (ShadowIsles, 0 Burst, Vagues souvenirs) — crée une copie
  // de l'adepte ciblé dans la main du caster (avec cardBuff Ephemeral).
  "01SI047": { type: "create-ephemeral-copy-of-target-in-hand" },

  // ── Phase 3.57 (random spell creation)
  // 01PZ016 (PiltoverZaun, 3 Burst, Éclair de génie) — crée un sort
  // aléatoire ≥ 6 cost depuis les régions du caster + restore spell mana.
  "01PZ016": {
    type: "create-random-spell-in-hand-from-regions",
    minCost: 6,
    restoreSpellMana: true,
  },
  // 01IO054 (Ionia, 2 Burst, Sagesse ancestrale) — crée un sort aléatoire
  // depuis les régions du caster (Illumination skip).
  "01IO054": { type: "create-random-spell-in-hand-from-regions" },

  // ── Phase 3.58 (counter-based conditional)
  // 01DE033 (Demacia, 6 Slow) — invoque un adepte aléatoire de cost 5
  // de Demacia. Cost reduction par morts d'alliés ce round : TODO
  // (nécessite un cost dynamique au play-time).
  "01DE033": {
    type: "summon-random-adept-from-region-cost",
    region: "Demacia",
    cost: 5,
  },
  // 01PZ033 (PiltoverZaun, 5 Slow) — si caster a joué ≥ 20 cardCodes
  // uniques cette partie, invoque 01PZ033T1 (Chatastrophe, 30/30).
  "01PZ033": {
    type: "summon-token-if-unique-cards-played-min",
    tokenCardCode: "01PZ033T1",
    minUnique: 20,
  },
  // 01FR051 (Freljord, 3 Slow) — si caster a un allié YÉTI, summon
  // 01FR028 (Yéti furieux, 5/5). Sinon ajoute le token au sommet du deck.
  "01FR051": {
    type: "summon-token-or-add-to-deck-if-no-subtype-ally",
    tokenCardCode: "01FR028",
    subtype: "YÉTI",
  },

  // ── Phase 3.59
  // 01SI025 (ShadowIsles, 7 Fast, Atrocité) — sacrifie un allié pour
  // infliger des dmg = power à n'importe quelle cible (unité ou nexus).
  "01SI025": { type: "kill-ally-deal-power-to-target-any-or-nexus" },
  // 01FR006 (Freljord, 5 Burst) — +2|+2 permanent à l'allié ciblé ET
  // toutes ses copies (même cardCode) où qu'elles soient.
  "01FR006": {
    type: "buff-ally-and-copies-everywhere-permanent",
    power: 2,
    health: 2,
  },

  // ── Phase 3.60
  // 01SI003 (ShadowIsles, 10 Slow, La Nuit de l'horreur) — ranime les
  // 6 alliés les plus puissants morts cette partie + Ephemeral.
  "01SI003": {
    type: "revive-n-most-powerful-dead-allies-this-game-as-ephemeral",
    count: 6,
  },

  // ── Phase 3.61
  // 01FR012 (Freljord, 5 Burst, Catalyseur de l'éternité) — gain mana
  // slot permanent + heal 3 nexus.
  "01FR012": { type: "gain-mana-slot-and-heal-nexus", healAmount: 3 },
  // 01PZ027 (PiltoverZaun, 0 Slow, Rayon thermogénique) — pay all mana
  // (mana + spellMana), dmg = ce montant à une unité (any).
  "01PZ027": { type: "pay-all-mana-deal-damage-target-any" },
  // 01SI019 (ShadowIsles, 4 Fast, La cage) — 3 dmg à toutes les unités
  // ennemies summoned ce round.
  "01SI019": { type: "damage-summoned-this-round-enemies", amount: 3 },

  // ── Phase 3.62
  // 01PZ046 (PiltoverZaun, 1 Burst, Contrefaçons) — auto-pick le card
  // de plus haut cost en main (excl. self) et crée 4 copies dans le deck.
  "01PZ046": { type: "auto-copy-best-hand-card-into-deck", copyCount: 4 },
  // 01SI006 (ShadowIsles, 5 Slow, Possession) — vole un adepte ennemi
  // jusqu'à fin de round (restoré au startRound suivant).
  "01SI006": { type: "steal-enemy-adept-this-round" },

  // ── Phase 3.63
  // 01DE025 (Demacia, 5 Fast, Capture) — vole une unité ennemie
  // (Champion autorisé, contrairement à Possession) jusqu'à fin de round.
  "01DE025": {
    type: "steal-enemy-adept-this-round",
    allowChampion: true,
  },
  // 01PZ005 (PiltoverZaun, 6 Fast, Transformer) — remplace target1 (allié)
  // par une copie exacte de target2 (unité quelconque, pas nexus).
  "01PZ005": { type: "transform-target-into-other-target" },
};

// ─── Imbue effects (Phase 3.22) ──────────────────────────────────────────
// Effets déclenchés sur les unités alliées avec le mot-clé Imbue à chaque
// fois que le caster lance un sort (résolu APRÈS l'effet du sort).

export type ImbueEffect =
  | { type: "buff-self-permanent"; power: number; health: number };

export const RUNETERRA_IMBUE_EFFECTS: Record<string, ImbueEffect> = {
  // Bot d'assemblage (PiltoverZaun, 1 mana, 1|1 + Imbue) :
  // « Quand vous lancez un sort, octroyez-moi +1|+1. »
  "01PZ003": { type: "buff-self-permanent", power: 1, health: 1 },
};

// ─── Last Breath effects (Phase 3.9b) ────────────────────────────────────
// Effets déclenchés quand une unité avec le mot-clé LastBreath meurt.
// L'engine appelle triggerLastBreath() à chaque mort + look up dans le
// registre par cardCode.

export type LastBreathEffect =
  | { type: "draw-cards"; count: number }
  | { type: "deal-damage-enemy-nexus"; amount: number }
  // Phase 3.15 : la mort de l'unité fait apparaître une AUTRE carte à sa
  // place (ex Anivia → Œuf d'Anivia). Différent de Tryndamere qui
  // gagne juste un niveau (cf tryReviveOnDeath).
  | { type: "revive-as-different-card"; replacementCardCode: string };

export const RUNETERRA_LAST_BREATH_EFFECTS: Record<
  string,
  LastBreathEffect
> = {
  // Guetteur avarosan (Freljord, 1 mana, 1|2) :
  // « Dernier souffle : piochez 1 carte. »
  "01FR003": { type: "draw-cards", count: 1 },
  // Anivia (Freljord, 6 mana, 4|3) :
  // « Dernier souffle : ranimez-moi transformée en Œuf d'Anivia. »
  // Œuf d'Anivia (01FR024T4) est un 0/2 qui prend la place d'Anivia.
  "01FR024": {
    type: "revive-as-different-card",
    replacementCardCode: "01FR024T4",
  },
};

// Phase 3.41 : "any-or-nexus" inclut unités (2 côtés) ET les 2 nexus.
// L'UI propose alors aussi des cibles « nexus-self » / « nexus-enemy ».
export type SpellTargetSide =
  | "ally"
  | "enemy"
  | "any"
  | "any-or-nexus"
  | "ally-and-enemy"
  | "ally-and-any-or-nexus"
  | "none";

export function getSpellTargetSide(effect: SpellEffect): SpellTargetSide {
  switch (effect.type) {
    case "buff-ally-round":
    case "buff-ally-permanent":
    case "grant-keyword-ally":
    case "grant-keyword-ally-round":
    case "heal-ally-or-nexus":
    case "recall-ally":
    case "combo-buff-keyword-ally-round":
    case "grant-keywords-ally-round":
    case "heal-ally-full":
    case "drain-ally":
    case "kill-ally-for-draw":
    case "summon-ally-copies":
    case "buff-2-allies-round":
    case "buff-2-allies-permanent":
    case "damage-ally-buff-other-ally-round":
    case "heal-ally-and-draw":
    case "recall-ally-and-summon-token":
    case "ally-strikes-all-enemies-in-combat":
    case "grant-keyword-2-allies-round":
    case "damage-ally-create-copy-in-hand-if-survives":
    case "buff-ally-and-copies-everywhere-permanent":
      return "ally";
    case "kill-ally-deal-power-to-target-any-or-nexus":
    case "transform-target-into-other-target":
      return "ally-and-any-or-nexus";
    case "deal-damage-anywhere":
    case "kill-target-any":
    case "recall-any":
    case "drain-target-any":
    case "deal-damage-anywhere-if-ally-died":
    case "drain-target-summon-token":
    case "kill-wounded-target-and-create-spell-in-hand":
    case "create-ephemeral-copy-of-target-in-hand":
    case "pay-all-mana-deal-damage-target-any":
      return "any";
    case "deal-damage-target-any-or-nexus":
      return "any-or-nexus";
    case "unit-strike-unit":
    case "unit-strike-unit-in-combat":
    case "swap-ephemeral":
      return "ally-and-enemy";
    case "frostbite-enemy":
    case "stun-enemy":
    case "silence-follower-target":
    case "frostbite-2-enemies":
    case "stun-enemy-buff-all-allies-round":
    case "damage-enemy-and-rally":
    case "damage-or-frostbite-by-power-zero":
    case "stun-attacker-enemy":
    case "steal-enemy-adept-this-round":
      return "enemy";
    case "deal-damage-enemy-nexus":
    case "kill-all-units":
    case "damage-all-enemies-heal-nexus":
    case "grant-keyword-all-allies-round":
    case "damage-all-units":
    case "gain-attack-token-self":
    case "combo-buff-keyword-all-allies-round":
    case "draw-champion":
    case "stun-all-enemies-max-power":
    case "summon-tokens":
    case "buff-all-allies-round":
    case "damage-all-combatants":
    case "summon-tokens-if-ally-died":
    case "kill-power-zero-and-frostbite-all-enemies":
    case "revive-random-dead-ally-this-round":
    case "grant-ephemeral-all-followers-in-combat":
    case "summon-tokens-and-buff-subtype-allies":
    case "kill-all-units-with-max-power-if-ally-min-power":
    case "buff-allies-in-hand-permanent":
    case "reduce-cost-allies-in-hand":
    case "grant-keyword-ally-in-hand-and-draw":
    case "buff-allies-of-subtype-everywhere":
    case "draw-and-reduce-cost":
    case "buff-all-allies-permanent":
    case "auto-discard-and-draw-up-to-n":
    case "create-random-spell-in-hand-from-regions":
    case "summon-random-adept-from-region-cost":
    case "summon-token-if-unique-cards-played-min":
    case "summon-token-or-add-to-deck-if-no-subtype-ally":
    case "revive-n-most-powerful-dead-allies-this-game-as-ephemeral":
    case "gain-mana-slot-and-heal-nexus":
    case "damage-summoned-this-round-enemies":
    case "auto-copy-best-hand-card-into-deck":
      return "none";
    case "auto-discard-and-damage-target-any-or-nexus":
      return "any-or-nexus";
  }
  return "none";
}

/** Phase 3.37 : combien de cibles d'unité ce sort attend. 0 = aucune
 *  cible, 1 = single-target (cas par défaut), 2 = 2 cibles distinctes
 *  (multi-target). Utilisé par UI + bot + validation pour le 2e target. */
export function getSpellTargetCount(effect: SpellEffect): 0 | 1 | 2 {
  switch (effect.type) {
    case "frostbite-2-enemies":
    case "buff-2-allies-round":
    case "buff-2-allies-permanent":
    case "damage-ally-buff-other-ally-round":
    case "unit-strike-unit":
    case "unit-strike-unit-in-combat":
    case "swap-ephemeral":
    case "grant-keyword-2-allies-round":
    case "kill-ally-deal-power-to-target-any-or-nexus":
    case "transform-target-into-other-target":
      return 2;
    default:
      return getSpellTargetSide(effect) === "none" ? 0 : 1;
  }
}

// ─── Lobby matchmaking LoR (Phase 3.6d) ──────────────────────────────────

export type LorLobbyClientMessage =
  | { type: "lor-queue"; deckId: string }
  | { type: "lor-leave-queue" };

export type LorLobbyServerMessage =
  | { type: "lor-queued"; position: number }
  | { type: "lor-matched"; roomId: string; deckId: string }
  | { type: "lor-lobby-error"; message: string };

// ─── Boosters Runeterra — 6 packs régions de Set 1 ───────────────────────
// Riot n'avait pas de système de packs (LoR utilisait des shards/wildcards).
// On invente un pack par région — pattern similaire à Pokémon TCG Pocket
// (3 packs thématiques) mais adapté à LoR : un pack tire dans le pool de
// sa région (cartes dont `regions` inclut la région du pack).

export type RuneterraPackTypeId =
  | "demacia"
  | "noxus"
  | "ionia"
  | "freljord"
  | "piltoverzaun"
  | "shadowisles";

export type RuneterraPackType = {
  id: RuneterraPackTypeId;
  region: RuneterraRegion;
  name: string;
  description: string;
  glyph: string;
  active: boolean;
  accent: string;
  border: string;
};

export const RUNETERRA_PACK_TYPES: Record<
  RuneterraPackTypeId,
  RuneterraPackType
> = {
  demacia: {
    id: "demacia",
    region: "Demacia",
    name: "Pack Demacia",
    description:
      "Booster Demacia — chevaliers, élites, magie sacrée. Lucian, Garen, Lux, Fiora.",
    glyph: "⚔️",
    active: true,
    accent: "text-yellow-200",
    border: "border-yellow-300/40",
  },
  noxus: {
    id: "noxus",
    region: "Noxus",
    name: "Pack Noxus",
    description:
      "Booster Noxus — soldats, force brute, conquête. Darius, Katarina, Draven, Vladimir.",
    glyph: "🔥",
    active: true,
    accent: "text-red-300",
    border: "border-red-500/40",
  },
  ionia: {
    id: "ionia",
    region: "Ionia",
    name: "Pack Ionia",
    description:
      "Booster Ionia — équilibre, esprit, agilité. Yasuo, Karma, Shen, Zed.",
    glyph: "🌸",
    active: true,
    accent: "text-pink-200",
    border: "border-pink-400/40",
  },
  freljord: {
    id: "freljord",
    region: "Freljord",
    name: "Pack Freljord",
    description:
      "Booster Freljord — gel, tribus, primalité. Ashe, Tryndamere, Anivia, Braum.",
    glyph: "❄️",
    active: true,
    accent: "text-cyan-200",
    border: "border-cyan-400/40",
  },
  piltoverzaun: {
    id: "piltoverzaun",
    region: "PiltoverZaun",
    name: "Pack Piltover & Zaun",
    description:
      "Booster P&Z — invention, chimie, machines. Jinx, Heimerdinger, Ezreal, Vi, Teemo.",
    glyph: "⚙️",
    active: true,
    accent: "text-orange-300",
    border: "border-orange-500/40",
  },
  shadowisles: {
    id: "shadowisles",
    region: "ShadowIsles",
    name: "Pack Îles obscures",
    description:
      "Booster Îles obscures — morts, brume noire, esprits. Hécarim, Kalista, Thresh, Elise.",
    glyph: "💀",
    active: true,
    accent: "text-emerald-300",
    border: "border-emerald-500/40",
  },
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
  // Pocket : 1 à 3 types d'énergies choisis manuellement à la création
  // du deck. Le moteur de combat ne génère que ces types (peu importe les
  // types des Pokémon présents dans le deck).
  energyTypes: PokemonEnergyType[];
  // One Piece : id du Leader (carte hors deck). null pour Pokémon/LoR.
  leaderId: string | null;
  // LoR : 1 ou 2 régions choisies (ex ["Demacia", "Noxus"]). Vide pour
  // Pokémon/OnePiece. Toutes les cartes du deck doivent partager au moins
  // une région avec celles-ci.
  regions: string[];
  updatedAt: number;
};

export type TcgClientMessage =
  | { type: "tcg-buy-pack"; packTypeId: string }
  | {
      type: "tcg-save-deck";
      deckId: string | null; // null = create
      name: string;
      cards: TcgDeckEntry[];
      energyTypes: PokemonEnergyType[];
      // One Piece : id du Leader. null pour Pokémon/LoR.
      leaderId: string | null;
      // LoR : régions choisies. Optionnel pour compat avec clients existants.
      regions?: string[];
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
  /** Numéro de tour pendant lequel les flags "prochain tour" sont actifs.
   *  Posés par une attaque/talent, ils expirent à advanceTurn une fois ce
   *  tour terminé. Si null/undefined : pas de flag actif. */
  nextTurnFlagsTurn?: number | null;
  /** Ne peut pas battre en retraite ce tour. */
  noRetreatNextTurn?: boolean;
  /** Ne peut pas attaquer ce tour. */
  noAttackNextTurn?: boolean;
  /** Subit -N dégâts venant des attaques ce tour (M. Mime Attaque d'Obstacle). */
  damageReductionNextTurn?: number;
  /** Les attaques de ce Pokémon infligent -N dégâts ce tour. */
  attackDamagePenaltyNextTurn?: number;
  /** Évite tous les dégâts et effets d'attaques ce tour. */
  invulnerableNextTurn?: boolean;
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
  // Pocket : 1 carte Supporter max par tour. Permet au client de griser les
  // Supporters quand déjà joué.
  usedSupporterThisTurn: boolean;
  // Réduction de coût de retraite ce tour (cumulable, ex Vitesse +). 0 par défaut.
  retreatDiscount: number;
  /** UIDs des Pokémon ayant déjà utilisé leur talent activable ce tour. Le
   *  client utilise cette liste pour griser le bouton ⭐ correspondant. */
  abilitiesUsedThisTurn: string[];
  /** Posé par une attaque/effet adverse : ce joueur ne peut pas jouer de
   *  Supporter pendant son tour courant. Reset à end-turn. */
  noSupporterThisTurn?: boolean;
  // Pocket : énergie générée automatiquement chaque tour, prête à être
  // attachée à un Pokémon (1 attache max/tour). null si pas d'énergie en
  // attente (consommée, ou tour 1 du first player qui n'en génère pas).
  pendingEnergy: PokemonEnergyType | null;
};

/** Carte en main vue par son propriétaire — cardId pour rendre l'image, uid
 *  pour avoir un identifiant stable (utile aux animations d'entrée/sortie
 *  côté client : la même copie de Pikachu garde son uid quand l'index
 *  shifte). */
export type BattleHandCard = { uid: string; cardId: string };

export type BattleSelfState = BattlePlayerPublicState & {
  hand: BattleHandCard[];
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
  /** Attaque normale ou attaque copiée (Mew « Mémoire Ancestrale »).
   *  Si `copyFromUid` + `copyAttackIndex` sont fournis ET que l'attaque
   *  d'origine contient l'effet `copy-opp-attack`, le serveur exécute
   *  l'attaque copiée à la place (en utilisant les énergies de
   *  l'attaquant pour payer le coût). */
  | {
      type: "battle-attack";
      attackIndex: number;
      copyFromUid?: string | null;
      copyAttackIndex?: number | null;
    }
  | { type: "battle-promote-active"; benchIndex: number }
  // Cartes Dresseur (subset starter implémenté côté serveur — voir handlePlayTrainer
  // dans party/src/battle.ts). targetUid optionnel selon la carte (ex Potion =
  // requis, Poké Ball = inutile).
  | {
      type: "battle-play-trainer";
      handIndex: number;
      targetUid?: string | null;
    }
  /** Active le talent (ability) d'un de nos Pokémon en jeu (Actif ou Banc).
   *  Pour les talents qui demandent une cible (Sheauriken, Roucarnage, Empiflor),
   *  une étape interactive supplémentaire est gérée côté UI puis renvoyée. */
  | {
      type: "battle-use-ability";
      cardUid: string;
      targetUid?: string | null;
    }
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
  // Animation pile/face. Le serveur l'émet AVANT le `battle-state` qui
  // contient le résultat — le client anime puis applique l'état dans la
  // foulée. `index/total` permet d'enchaîner plusieurs lancers (ex Ondine).
  | {
      type: "battle-coin-flip";
      id: string;
      label: string;
      result: "heads" | "tails";
      index?: number;
      total?: number;
      followUp?: string;
    }
  // Reveal de cartes au joueur qui en est à l'origine (Pokédex = 1 carte
  // top deck, Scrute Main = main de l'adversaire). Privé : envoyé seulement
  // au siège qui a joué la carte.
  | {
      type: "battle-trainer-reveal";
      trainerName: string;
      cardIds: string[];
    }
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

/** Niveau max héros (et familier) : endgame ultime atteignable via prestiges. */
export const ETERNUM_LEVEL_MAX = 1000;

/** Stats calculées d'un héros à un niveau donné (sans équipement). */
export function eternumHeroStats(
  classId: EternumClassId,
  level: number,
): { hp: number; atk: number; def: number; spd: number } {
  const c = ETERNUM_CLASSES[classId];
  const lv = Math.max(1, Math.min(ETERNUM_LEVEL_MAX, level));
  return {
    hp: Math.round(c.baseStats.hp + c.growth.hp * (lv - 1)),
    atk: Math.round(c.baseStats.atk + c.growth.atk * (lv - 1)),
    def: Math.round(c.baseStats.def + c.growth.def * (lv - 1)),
    spd: Math.round(c.baseStats.spd + c.growth.spd * (lv - 1)),
  };
}

/** Courbe XP croissante : XP requis pour passer du niveau N → N+1.
 *  Formule : 100 × N^1.2 (douce early, raide endgame).
 *  Cumul level 100 ≈ 3 M XP / cumul level 1000 ≈ 280 M XP.
 *  Le prestige est conçu comme la solution principale pour atteindre 1000. */
export function eternumXpForNextLevel(currentLevel: number): number {
  return Math.round(100 * Math.pow(currentLevel, 1.2));
}

export type EternumHero = {
  classId: EternumClassId;
  elementId: EternumElementId;
  jobId: EternumJobId | null;
  level: number;
  xp: number;
  evolutionStage: number;
  prestigeCount: number;
  /** Bitmask 10 bits : bit i = pierre du palier (i+1)×100 acquise. */
  prestigeStones: number;
  energy: number;
  energyUpdatedAt: number; // ms epoch
  idleStage: number;
  idleUpdatedAt: number; // ms epoch
};

/** Bonus % XP par pierre, croissants pour récompenser pousser plus haut. */
export const ETERNUM_PRESTIGE_BONUSES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

/** Liste des paliers en niveau (pour l'UI). */
export const ETERNUM_PRESTIGE_PALIERS = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
] as const;

/** Renvoie l'array des paliers (1..10) actuellement possédés à partir du bitmask. */
export function eternumPrestigeStonesOwned(bitmask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 10; i++) {
    if ((bitmask >> i) & 1) out.push(ETERNUM_PRESTIGE_PALIERS[i]);
  }
  return out;
}

/** Multiplicateur XP total selon les pierres possédées (1.0 base, jusqu'à 1.95). */
export function eternumXpMultiplier(bitmask: number): number {
  let mult = 1.0;
  for (let i = 0; i < 10; i++) {
    if ((bitmask >> i) & 1) {
      mult += ETERNUM_PRESTIGE_BONUSES[i] * 0.01;
    }
  }
  return mult;
}

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

// ────────────────────────────── ONE PIECE TCG ─────────────────────────────
// Phase 1 : OP-09 (Les Nouveaux Empereurs) + ST-15 à ST-21 (les 6 starters
// + 1 starter EX du lancement officiel français de Bandai en 2024-2025).
// Bandai France n'a jamais traduit OP-01 à OP-08 ni ST-01 à ST-14.
// Données scrapées en français depuis fr.onepiece-cardgame.com (rendu côté
// serveur — voir scripts/generate-onepiece-cards-fr.mjs).

export type OnePieceColor =
  | "rouge"
  | "vert"
  | "bleu"
  | "violet"
  | "noir"
  | "jaune";

export type OnePieceCategory =
  | "leader"
  | "character"
  | "event"
  | "stage"
  | "don";

// Attribut (icône sur la carte) pour Personnages/Leaders.
export type OnePieceAttribute =
  | "frappe" // Strike
  | "tranche" // Slash
  | "distance" // Ranged
  | "special" // Spécial
  | "sagesse"; // Wisdom

// Raretés Bandai officielles.
//   c   = Commune
//   uc  = Peu Commune
//   r   = Rare
//   sr  = Super Rare
//   sec = Secret Rare
//   l   = Leader
//   p   = Promo
//   tr  = Treasure Rare (gold/foil)
//   sp  = Special (alt-art)
//   don = DON!! card
export type OnePieceRarity =
  | "c"
  | "uc"
  | "r"
  | "sr"
  | "sec"
  | "l"
  | "p"
  | "tr"
  | "sp"
  | "don";

// Champs partagés entre toutes les cartes One Piece.
type OnePieceCardBase = {
  // Identifiant complet (avec suffixe variante alt-art : ex "OP02-001_p1").
  // C'est cet ID qui sert de PK côté collection / deck.
  id: string;
  // ID de carte sans suffixe variante : "OP02-001". Permet de regrouper
  // toutes les versions d'une même carte.
  cardNumber: string;
  // Nom FR (les noms de personnages One Piece sont identiques EN/FR).
  name: string;
  rarity: OnePieceRarity;
  // URL absolue de l'image full-card sur le CDN Bandai FR.
  image: string;
  // Extension où la carte a été observée (peut être différente de
  // l'extension d'origine pour les rééditions alt-art).
  set: string;
  // Numéro de bloc compétitif Bandai (1, 2, 3…).
  block: number;
  // Effet — descriptif uniquement tant que le moteur d'effets n'est pas
  // implémenté (Phase 3 : combat fidèle).
  effect: string | null;
  // Trigger : effet qui se déclenche quand la carte est révélée d'une Vie.
  trigger: string | null;
  // Familles / affiliations (multiples) telles qu'écrites par Bandai —
  // ex ["Quatre Empereurs", "Équipage de Barbe Blanche"].
  types: string[];
  // Booster thématique principal de la carte (1ère couleur). Une carte
  // multi-couleurs peut apparaître dans plusieurs boosters via extraPacks.
  pack: OnePiecePackTypeId;
  // Boosters supplémentaires si carte multi-couleurs (sinon undefined).
  extraPacks?: OnePiecePackTypeId[];
};

export type OnePieceLeaderCard = OnePieceCardBase & {
  kind: "leader";
  color: OnePieceColor[]; // 1-2 couleurs (mono ou bi-colore)
  life: number; // 4-5 typiquement
  power: number;
  attribute: OnePieceAttribute;
};

export type OnePieceCharacterCard = OnePieceCardBase & {
  kind: "character";
  color: OnePieceColor[];
  cost: number; // 0-10
  power: number; // 1000-13000 par incréments de 1000
  counter: number | null; // 0 / 1000 / 2000 ou null si pas de counter
  attribute: OnePieceAttribute;
};

export type OnePieceEventCard = OnePieceCardBase & {
  kind: "event";
  color: OnePieceColor[];
  cost: number;
  counter: number | null;
};

export type OnePieceStageCard = OnePieceCardBase & {
  kind: "stage";
  color: OnePieceColor[];
  cost: number;
  counter: number | null;
};

// DON!! : ressource neutre, séparée du deck principal (10 par deck).
export type OnePieceDonCard = OnePieceCardBase & {
  kind: "don";
};

export type OnePieceCardData =
  | OnePieceLeaderCard
  | OnePieceCharacterCard
  | OnePieceEventCard
  | OnePieceStageCard
  | OnePieceDonCard;

export type OnePieceSetId =
  | "OP-09"
  | "ST-15"
  | "ST-16"
  | "ST-17"
  | "ST-18"
  | "ST-19"
  | "ST-20"
  | "ST-21";

export type OnePieceSetConfig = {
  id: OnePieceSetId;
  name: string; // FR
  // Identifiant interne `series` du site Bandai FR (param ?series=).
  // Utilisé par le scraper.
  seriesId: number;
  kind: "booster" | "starter" | "starter-ex";
  // Couleur dominante du set (null pour boosters multi-couleurs).
  color: OnePieceColor | null;
};

// ─── Boosters One Piece TCG : 6 packs thématiques par couleur ─────────────
// Chaque carte appartient à un pack principal (sa première couleur) et peut
// avoir des extraPacks si elle est multi-couleurs. Tirage du pack = pool des
// cartes assignées à ce pack (principal + extra).

export type OnePiecePackTypeId =
  | "rouge"
  | "vert"
  | "bleu"
  | "violet"
  | "noir"
  | "jaune";

export type OnePiecePackType = {
  id: OnePiecePackTypeId;
  name: string;
  description: string;
  glyph: string;
  active: boolean;
  accent: string;
  border: string;
};

export const ONEPIECE_PACK_TYPES: Record<OnePiecePackTypeId, OnePiecePackType> =
  {
    rouge: {
      id: "rouge",
      name: "Pack Rouge",
      description:
        "Cartes rouges — Chapeaux de Paille, Quatre Empereurs (Shanks/Newgate), Armée révolutionnaire.",
      glyph: "🔴",
      active: true,
      accent: "text-red-300",
      border: "border-red-500/50",
    },
    vert: {
      id: "vert",
      name: "Pack Vert",
      description:
        "Cartes vertes — Uta, Bonney, Yamato, factions hybrides et tireurs.",
      glyph: "🟢",
      active: true,
      accent: "text-emerald-300",
      border: "border-emerald-500/50",
    },
    bleu: {
      id: "bleu",
      name: "Pack Bleu",
      description:
        "Cartes bleues — Marine, Doflamingo, Hancock, contrôle et bouncing.",
      glyph: "🔵",
      active: true,
      accent: "text-sky-300",
      border: "border-sky-500/50",
    },
    violet: {
      id: "violet",
      name: "Pack Violet",
      description:
        "Cartes violettes — Luffy V/N, Marshall D. Teach, Kaido, ramp DON!! agressif.",
      glyph: "🟣",
      active: true,
      accent: "text-violet-300",
      border: "border-violet-500/50",
    },
    noir: {
      id: "noir",
      name: "Pack Noir",
      description:
        "Cartes noires — Smoker, Doflamingo, CP-0, Pirates de Barbe Noire et coût-réduction.",
      glyph: "⚫",
      active: true,
      accent: "text-zinc-200",
      border: "border-zinc-400/50",
    },
    jaune: {
      id: "jaune",
      name: "Pack Jaune",
      description:
        "Cartes jaunes — Charlotte Katakuri, Pirates de Big Mom, manipulation des Vies.",
      glyph: "🟡",
      active: true,
      accent: "text-yellow-300",
      border: "border-yellow-500/50",
    },
  };

export const ONEPIECE_SETS: Record<OnePieceSetId, OnePieceSetConfig> = {
  "OP-09": {
    id: "OP-09",
    name: "Les Nouveaux Empereurs",
    seriesId: 622109,
    kind: "booster",
    color: null,
  },
  "ST-15": {
    id: "ST-15",
    name: "Edward Newgate",
    seriesId: 622015,
    kind: "starter",
    color: "rouge",
  },
  "ST-16": {
    id: "ST-16",
    name: "Uta",
    seriesId: 622016,
    kind: "starter",
    color: "vert",
  },
  "ST-17": {
    id: "ST-17",
    name: "Donquixote Doflamingo",
    seriesId: 622017,
    kind: "starter",
    color: "bleu",
  },
  "ST-18": {
    id: "ST-18",
    name: "Monkey D. Luffy",
    seriesId: 622018,
    kind: "starter",
    color: "violet",
  },
  "ST-19": {
    id: "ST-19",
    name: "Smoker",
    seriesId: 622019,
    kind: "starter",
    color: "noir",
  },
  "ST-20": {
    id: "ST-20",
    name: "Charlotte Katakuri",
    seriesId: 622020,
    kind: "starter",
    color: "jaune",
  },
  "ST-21": {
    id: "ST-21",
    name: "Gear 5th",
    seriesId: 622021,
    kind: "starter-ex",
    color: "rouge",
  },
};

// ─── One Piece TCG — Battle (Phase 3a : squelette) ─────────────────────────
// Combat fidèle au jeu officiel Bandai. Mécaniques implémentées
// progressivement (3a-3e) — voir party/src/battle-onepiece.ts.

export const OP_BATTLE_CONFIG = {
  /** Taille du deck principal One Piece TCG. */
  deckSize: 50,
  /** Max copies par cardNumber (alt-arts inclus). */
  maxCopies: 4,
  /** Cartes piochées au setup avant mulligan. */
  openingHandSize: 5,
  /** Cartes DON dans le deck DON séparé. */
  donDeckSize: 10,
  /** Personnages max sur le terrain. */
  maxCharacters: 5,
  /** Lieux max sur le terrain. */
  maxStages: 1,
} as const;

export type OnePieceBattleSeatId = "p1" | "p2";

export type OnePieceBattlePhase =
  | "waiting" // en attente du 2ème joueur
  | "mulligan" // chaque joueur peut mulligan une fois (accepter / refuser)
  | "playing" // tours actifs
  | "ended";

// Phases dans un tour One Piece TCG (officiel).
export type OnePieceTurnPhase =
  | "refresh" // redresse les cartes épuisées
  | "draw" // pioche 1 (sauf 1er tour du joueur 1)
  | "don" // ajoute 2 DON depuis le DON deck (1 au 1er tour du joueur 1)
  | "main" // phase principale (joueur agit)
  | "end"; // effets de fin de tour, retire les DON attachées

export type OnePieceBattleCardInPlay = {
  uid: string; // identifiant serveur unique pour cette instance posée
  cardId: string; // référence vers OnePieceCardData
  attachedDon: number; // nombre de DON attachées (boost +1000 power chacune)
  rested: boolean; // true = épuisée (a déjà attaqué ou été ciblée)
  // Vrai si la carte est arrivée ce tour — interdit d'attaquer (sauf
  // [Initiative]/Rush).
  playedThisTurn: boolean;
  // Modificateur de coût temporaire (pour ce tour). Reset à end-turn.
  // Utilisé par les filtres maxCost des PendingChoice (Tsuru, Hermep,
  // Ice Age, etc. réduisent le coût pour permettre des KO ciblés).
  // Effective cost = meta.cost + (costBuff ?? 0). Peut être négatif.
  costBuff?: number;
  // Si true, ce Persos ne peut pas activer [Bloqueur] pour le reste du
  // tour (Limejuice OP09-014, Dawn Whip ST21-016 sub-effet). Reset
  // à end-turn.
  noBlockerThisTurn?: boolean;
  // Si true, ce Persos ne peut pas attaquer jusqu'à la fin du prochain
  // tour adverse (Smoker ST19-001). Reset à la fin de ce tour-là.
  cannotAttackUntilNextOppTurnEnd?: boolean;
  // Si true, quand ce Persos attaque, l'adversaire ne peut pas activer
  // [Bloqueur] pour cette attaque (ST21-003 Sanji). Reset après le
  // premier attaque déclenchée OU à end-turn si pas utilisé.
  nextAttackPreventsBlock?: boolean;
  // Mots-clés temporaires accordés par effet (Catarina Devon → Bloqueur
  // / Double attaque / Exil jusqu'à fin du prochain tour adverse). Reset
  // à end-turn de ce tour-là.
  tempKeywords?: string[];
  // Si true, ce Persos a une substitution KO active (Cracker ST20-002 :
  // mill 1 vie au lieu d'être KO ; Monster OP09-012 : sacrifie ce Persos
  // pour sauver un [Bonk Punch]). Le moteur consulte KO_SUBSTITUTES
  // registry par cardNumber pour la sémantique exacte.
  // Tracker "1/turn" pour les substitutions limitées.
  koSubUsedThisTurn?: boolean;
};

export type OnePieceBattlePlayerPublicState = {
  authId: string;
  username: string;
  deckName: string | null;
  // Leader posé en début de partie. Toujours visible. attachedDon est public.
  leader: {
    cardId: string;
    rested: boolean;
    attachedDon: number;
  } | null;
  // Personnages sur le terrain (≤ OP_BATTLE_CONFIG.maxCharacters).
  characters: OnePieceBattleCardInPlay[];
  // Lieu actif (max 1).
  stage: OnePieceBattleCardInPlay | null;
  // Vies restantes (le Leader prend une carte Vie quand il subit une attaque
  // — cette carte va dans la main du joueur, avec possibilité de Trigger).
  life: number;
  // Vies face-visibles (Katakuri ST20-001 retourne 1 Vie face visible).
  // Liste de cardIds visibles publiquement aux 2 joueurs. Position dans
  // la pile inconnue du client (juste les contenus révélés).
  faceUpLifeCardIds: string[];
  // DON area : redressées (utilisables) vs épuisées (déjà utilisées ce tour).
  donActive: number;
  donRested: number;
  // Cartes restantes dans le DON deck séparé.
  donDeckSize: number;
  // Cartes restantes dans le deck principal.
  deckSize: number;
  // Cartes en main (cachées pour l'adverse, count public).
  handCount: number;
  // Défausse (count public).
  discardSize: number;
  // Contenu de la défausse (info publique en One Piece TCG — visible des
  // 2 joueurs). Utilisé par les effets «jouez 1 Persos de votre Défausse»
  // (Gecko Moria, Sanji on-ko, etc.). Liste de cardIds.
  discard: string[];
  // True si le mulligan a été décidé (oui/non) en setup.
  mulliganDecided: boolean;
};

export type OnePieceBattleSelfState = OnePieceBattlePlayerPublicState & {
  // Cartes de la main visibles pour soi.
  hand: string[];
};

// Attaque en cours : ouverte par l'attaquant, fenêtre de défense pour
// l'adversaire qui peut Bloquer / Counter / Passer.
export type OnePieceBattlePendingAttack = {
  attackerSeat: OnePieceBattleSeatId;
  // "leader" ou uid d'un Personnage en jeu côté attaquant.
  attackerUid: string;
  // "leader" ou uid d'un Personnage en jeu côté défenseur.
  targetUid: string;
  // Power de l'attaquant (base + DON attachées × 1000 + bonus).
  attackerPower: number;
  // Power de base du défenseur (sans counter).
  defenderBasePower: number;
  // +1000/+2000 cumulés via Counter joués depuis la main.
  defenderBoost: number;
  // True si l'attaquant a Double Attaque (prend 2 Vies sur Leader hit).
  doubleAttack: boolean;
};

// Trigger révélé : une Vie révélée a un effet [Trigger] (descriptif),
// le défenseur peut choisir d'activer ou refuser. Bloque la résolution.
export type OnePieceBattlePendingTrigger = {
  defenderSeat: OnePieceBattleSeatId;
  cardId: string;
  trigger: string;
};

// Choix demandé au joueur pendant la résolution d'un effet de carte
// (ciblage Persos pour KO, sélection main pour discard, etc.). Bloque le
// flow jusqu'à réception d'un `op-resolve-choice` du joueur concerné.
export type OnePiecePendingChoiceKind =
  | "ko-character" // Choisir un Persos adverse à mettre KO (avec maxCost optionnel)
  | "ko-character-own" // Choisir un de ses propres Persos à mettre KO
  | "buff-target" // Choisir un de ses Leader/Persos pour booster
  | "discard-card" // Défausser N carte(s) de sa main (count + filtre)
  | "select-target" // Sélectionner une cible générique (Leader ou Persos)
  | "play-from-hand" // Choisir 1 Persos de la main à jouer gratuitement (Crocodile, Trafalgar Law, Lim, Baggy, etc.)
  | "play-from-discard" // Choisir 1 Persos de la défausse à jouer (épuisé) gratuitement (Gecko Moria, Sanji)
  | "ko-multi-combined-power" // KO ≤ N Persos adv avec contrainte power combinée (Disparais OP09-018)
  | "reorder-top-deck" // Regarder N cartes top deck + réorganiser top/bottom (Hancock ST17-004)
  | "select-option" // Choix multi-options arbitraires (Catarina Devon : Bloqueur / Double / Exil)
  | "yes-no"; // Choix oui/non simple (l'effet est-il activé ?)

export type OnePiecePendingChoice = {
  // Identifiant unique pour matcher la résolution.
  id: string;
  // Qui doit choisir (en général le joueur qui a joué la carte).
  seat: OnePieceBattleSeatId;
  // CardNumber de la source (pour router la résolution vers le bon handler).
  sourceCardNumber: string;
  // Uid de la source en jeu (Persos posé / "leader") — pour effets [Activation].
  sourceUid: string;
  kind: OnePiecePendingChoiceKind;
  // Texte affiché au joueur.
  prompt: string;
  // Paramètres du choix selon le kind. Champs optionnels selon le besoin :
  // - maxCost : coût max (ko-character)
  // - count : nombre à défausser (discard-card)
  // - amount : montant du buff (buff-target)
  // - excludeName : nom à exclure
  // - allowLeader / allowCharacters : booléens (select-target)
  // - requireTrigger : ne défausser que des cartes ayant [Déclenchement]
  params: Record<string, number | string | boolean | null>;
  // Si true, le joueur peut passer sans rien faire (l'effet est ignoré).
  cancellable: boolean;
};

export type OnePieceBattleState = {
  roomId: string;
  phase: OnePieceBattlePhase;
  turnPhase: OnePieceTurnPhase;
  self: OnePieceBattleSelfState | null;
  opponent: OnePieceBattlePlayerPublicState | null;
  selfSeat: OnePieceBattleSeatId | null;
  activeSeat: OnePieceBattleSeatId | null;
  turnNumber: number;
  winner: OnePieceBattleSeatId | null;
  log: string[];
  // null sauf pendant la fenêtre de défense.
  pendingAttack: OnePieceBattlePendingAttack | null;
  // null sauf pendant la résolution d'un Trigger.
  pendingTrigger: OnePieceBattlePendingTrigger | null;
  // null sauf pendant la résolution d'un effet de carte qui demande un
  // choix au joueur (cible KO, carte à défausser, etc.).
  pendingChoice: OnePiecePendingChoice | null;
};

export type OnePieceBattleClientMessage =
  // Mulligan : true = refait sa main une fois (1× max).
  | { type: "op-mulligan"; take: boolean }
  // Main phase actions
  | { type: "op-play-character"; handIndex: number }
  | { type: "op-play-event"; handIndex: number }
  | { type: "op-play-stage"; handIndex: number }
  // targetUid : "leader" pour le Leader, sinon uid d'un Personnage en jeu.
  | { type: "op-attach-don"; targetUid: string }
  | { type: "op-activate-main"; uid: string }
  | { type: "op-attack"; attackerUid: string; targetUid: string }
  // Réponses pendant une attaque adverse.
  | { type: "op-block"; blockerUid: string }
  | { type: "op-counter"; handIndex: number }
  | { type: "op-pass-defense" }
  // Trigger révélé d'une Vie : accepter / refuser.
  | { type: "op-trigger-resolve"; activate: boolean }
  // Résolution d'un PendingChoice. choiceId doit matcher state.pendingChoice.id.
  // skipped=true → annulé / passé (effet ignoré). selection contient le choix
  // (uid de la cible, handIndices à défausser, etc.) selon le kind.
  | {
      type: "op-resolve-choice";
      choiceId: string;
      skipped: boolean;
      selection?: {
        targetUid?: string; // ko-character / buff-target / select-target
        targetUids?: string[]; // ko-multi-combined-power
        handIndices?: number[]; // discard-card
        yesNo?: boolean; // yes-no
        // reorder-top-deck : ordre + placement de chaque carte révélée.
        reorderTopDeck?: { cardId: string; placement: "top" | "bottom" }[];
        // select-option : option choisie (Catarina Devon : keyword name).
        selectedOption?: string;
      };
    }
  | { type: "op-end-turn" }
  | { type: "op-concede" }
  | { type: "chat"; text: string };

export type OnePieceBattleServerMessage =
  | {
      type: "op-welcome";
      selfId: string;
      selfSeat: OnePieceBattleSeatId | null;
    }
  | { type: "op-state"; state: OnePieceBattleState }
  | { type: "op-error"; message: string }
  // Reveal de Trigger sur Vie révélée (privé pour le défenseur).
  | { type: "op-trigger-reveal"; cardId: string; trigger: string | null }
  | { type: "chat"; message: ChatMessage };

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
  | { type: "stand" };

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
  | "playing"
  | "dealer"
  | "resolving";

export type BlackjackSeatStatus =
  | "empty"
  | "waiting"
  | "ready"
  | "betting"
  | "playing"
  | "stood"
  | "busted"
  | "blackjack"
  | "won"
  | "lost"
  | "pushed";

export type BlackjackSeat = {
  seatIndex: number;
  playerId: string | null;
  playerName: string | null;
  playerColor: string | null;
  gold: number;
  bet: number;
  hand: Card[];
  score: number;
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

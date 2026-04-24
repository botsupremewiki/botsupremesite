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
};

export type ClientMessage =
  | { type: "move"; x: number; y: number; direction: Direction }
  | { type: "set-name"; name: string }
  | { type: "chat"; text: string };

export type ServerMessage =
  | { type: "welcome"; selfId: string; players: Player[]; chat: ChatMessage[] }
  | { type: "player-joined"; player: Player }
  | { type: "player-left"; playerId: string }
  | { type: "player-moved"; playerId: string; x: number; y: number; direction: Direction }
  | { type: "player-renamed"; playerId: string; name: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "error"; message: string };

export const PLAZA_CONFIG = {
  width: 1024,
  height: 640,
  maxPlayers: 30,
  moveSpeed: 2.5,
  chatHistorySize: 30,
} as const;

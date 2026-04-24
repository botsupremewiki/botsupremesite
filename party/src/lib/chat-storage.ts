import type * as Party from "partykit/server";
import type { ChatMessage } from "../../../shared/types";

const HISTORY_KEY = "chat-history-v1";
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Chat history that persists across worker restarts via PartyKit Durable
 * Storage, with a 24h sliding window (older messages pruned on every write
 * and on cold load).
 */
export class PersistentChatHistory {
  private messages: ChatMessage[] = [];
  private loaded = false;

  constructor(
    private readonly room: Party.Room,
    private readonly maxSize = 200,
    private readonly maxAgeMs = DEFAULT_MAX_AGE_MS,
  ) {}

  async load() {
    if (this.loaded) return;
    try {
      const stored = await this.room.storage.get<ChatMessage[]>(HISTORY_KEY);
      const now = Date.now();
      const filtered = (stored ?? []).filter(
        (m) => now - m.timestamp < this.maxAgeMs,
      );
      this.messages = filtered;
      if (stored && filtered.length !== stored.length) {
        // Prune persisted entries that are older than the window.
        await this.persist();
      }
    } catch {
      this.messages = [];
    }
    this.loaded = true;
  }

  async add(msg: ChatMessage) {
    await this.load();
    const now = Date.now();
    this.messages = this.messages.filter(
      (m) => now - m.timestamp < this.maxAgeMs,
    );
    this.messages.push(msg);
    if (this.messages.length > this.maxSize) {
      this.messages = this.messages.slice(-this.maxSize);
    }
    await this.persist();
  }

  async list(): Promise<ChatMessage[]> {
    await this.load();
    const now = Date.now();
    return this.messages.filter((m) => now - m.timestamp < this.maxAgeMs);
  }

  private async persist() {
    try {
      await this.room.storage.put(HISTORY_KEY, this.messages);
    } catch {
      // non-fatal; in-memory copy is still correct until next restart
    }
  }
}
